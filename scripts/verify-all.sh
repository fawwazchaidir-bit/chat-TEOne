#!/usr/bin/env bash
# Verifikasi menyeluruh setara CI pada SATU commit, dengan bukti yang dapat diperiksa ulang (G1-A02, audit Gate 1).
#   bash scripts/verify-all.sh            # semua langkah
#   bash scripts/verify-all.sh --ci       # didahului `npm ci`
# Setiap langkah dicatat di .verify/NN-nama.log + kode keluar + durasi; ringkasan di .verify/ringkasan.md.
# Status jujur per langkah:  LULUS · GAGAL · TIDAK DAPAT DIJALANKAN (prasyarat tidak ada — BUKAN lulus).
# Skrip keluar 0 HANYA bila SEMUA langkah LULUS. Prasyarat: Node 22, PostgreSQL 16 (TEST_ADMIN_DATABASE_URL), psql/pg_dump/pg_restore, gpg,
# Chromium (PW_CHROMIUM_PATH bila tidak memakai bawaan Playwright), gitleaks 8.24.3 (opsional di lokal; CI memakai biner ber-pin checksum;
# pasang dengan `bash scripts/install-gitleaks.sh` lalu tambahkan folder keluarannya ke PATH).
set -u
cd "$(dirname "$0")/.."
OUT=.verify
rm -rf "$OUT" .test-results; mkdir -p "$OUT"   # bukti selalu baru: hasil eksekusi lama tidak boleh ikut terbaca
SUM="$OUT/ringkasan.md"
N=0; FAIL=0; BLOCKED=0

sha=$(git rev-parse HEAD 2>/dev/null || echo "tanpa-git")
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
{
  echo "# Ringkasan verifikasi"
  echo
  echo "- Commit: \`$sha\` (perubahan belum di-commit: $dirty berkas)"
  echo "- Waktu: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Node: $(node -v 2>&1) (CI memakai Node 22 — .nvmrc) · npm: $(npm -v 2>&1)"
  echo "- PostgreSQL klien: $(psql --version 2>&1 | head -1) · pg_dump: $(pg_dump --version 2>&1 | head -1) · gpg: $(gpg --version 2>&1 | head -1)"
  echo
  echo "| # | Langkah | Hasil | Kode keluar | Durasi (dtk) | Log |"
  echo "|---|---|---|---|---|---|"
} > "$SUM"
case "$(node -v)" in v22.*) ;; *) echo "PERINGATAN: Node $(node -v) ≠ 22 (versi CI). Hasil tidak setara CI." | tee -a "$OUT/peringatan.txt" ;; esac

# PostgreSQL terjangkau? Host:port diturunkan dari TEST_ADMIN_DATABASE_URL (sama dengan yang dipakai test), jadi server di port
# nonstandar cukup dikonfigurasi lewat SATU variabel (audit ulang Gate 1). Default: localhost:5432.
db_up() {
  node -e '
    const u = new URL(process.env.TEST_ADMIN_DATABASE_URL || "postgres://postgres@localhost:5432/postgres");
    require("net").connect(+(u.port || 5432), u.hostname).on("connect", () => process.exit(0)).on("error", () => process.exit(1));'
}

# step "nama" "perintah" ["prasyarat-perintah" | @db ...]
step() {
  local name="$1" cmd="$2"; shift 2
  N=$((N+1)); local id; id=$(printf "%02d" "$N"); local log="$OUT/$id-$name.log"
  local missing=""
  for need in "$@"; do
    if [ "$need" = "@db" ]; then db_up || missing="$missing PostgreSQL-terjangkau"
    elif [ "$need" = "@chromium" ]; then
      # Chromium harus benar-benar dapat dibuka (di sebagian sandbox gagal `socket() EPERM`): keterbatasan lingkungan ≠ kegagalan aplikasi ≠ lulus.
      cr="$(node scripts/check-chromium.mjs 2>&1)" || missing="$missing Chromium-dapat-dijalankan(${cr})"
    else command -v "$need" >/dev/null 2>&1 || missing="$missing $need"; fi
  done
  if [ -n "$missing" ]; then
    echo "TIDAK DAPAT DIJALANKAN — prasyarat tidak ada:$missing" > "$log"
    echo "| $id | $name | **TIDAK DAPAT DIJALANKAN** (tidak ada:$missing) | - | - | \`$log\` |" >> "$SUM"
    BLOCKED=$((BLOCKED+1)); echo "[$id] $name: TIDAK DAPAT DIJALANKAN ($missing)"; return
  fi
  local t0 t1 code; t0=$(date +%s)
  bash -c "$cmd" > "$log" 2>&1; code=$?
  t1=$(date +%s)
  if [ "$code" -eq 0 ]; then res="LULUS"; else res="**GAGAL**"; FAIL=$((FAIL+1)); fi
  echo "| $id | $name | $res | $code | $((t1-t0)) | \`$log\` |" >> "$SUM"
  echo "[$id] $name: $res (kode $code, $((t1-t0)) dtk)"
}

[ "${1:-}" = "--ci" ] && step "npm-ci" "npm ci" npm
step "lint" "npm run lint" npm
step "typecheck" "npm run typecheck" npm
step "guard-nomor-operasional" "npm run guard:operational" npm
step "secret-scan-lokal" "npm run scan:secrets" npm
step "gitleaks-seluruh-riwayat" "gitleaks detect --source . --redact --no-banner --exit-code 2 --verbose" gitleaks
step "npm-audit-produksi" "npm audit --omit=dev --audit-level=high" npm
step "build" "npm run build" npm
# test:report = Vitest SUNGGUHAN + penjaga (exit code Vitest diteruskan; lihat scripts/run-test-report.mjs). Butuh PostgreSQL.
step "vitest-regresi-dan-penjaga" "npm run test:report" npm @db
step "e2e-playwright" "npm run e2e" npm @db @chromium
step "penjaga-akhir-dengan-e2e" "node scripts/test-tag-report.mjs --require-e2e" node @chromium
step "drill-backup-restore" "bash scripts/backup-restore-drill.sh" @db psql pg_dump pg_restore gpg

{
  echo
  if [ -f .test-results/tag-report.md ]; then echo "## Jumlah test per tag"; echo; cat .test-results/tag-report.md; echo; fi
  [ -f .test-results/vitest-exit.json ] && { echo "## Bukti exit code Vitest"; echo '```json'; cat .test-results/vitest-exit.json; echo '```'; }
  echo
  echo "**Total:** $N langkah · $FAIL gagal · $BLOCKED tidak dapat dijalankan."
  if [ "$FAIL" -eq 0 ] && [ "$BLOCKED" -eq 0 ]; then echo "**KESIMPULAN: semua langkah LULUS pada commit \`$sha\`.**"
  else echo "**KESIMPULAN: BELUM semua langkah lulus. Langkah yang tidak dapat dijalankan BUKAN bukti lulus.**"; fi
} >> "$SUM"
cat "$SUM"
[ "$FAIL" -eq 0 ] && [ "$BLOCKED" -eq 0 ]
