#!/usr/bin/env bash
# Membangun image staging yang DAPAT DIKAITKAN ke satu commit (tindak lanjut Gate 1–2): menolak pohon kerja yang kotor, memberi label
# `org.opencontainers.image.revision` = SHA commit, menandai image `staging-<sha7>` (+ `staging`), dan mencetak catatan provenance untuk bukti uji.
#   bash scripts/build-staging-image.sh                 # di server/CI, pada checkout bersih commit yang akan diuji
#   TEONE_TAG=staging-<sha7> docker compose -f deploy/docker-compose.staging.yml up -d app worker caddy
# ALLOW_DIRTY=1 mengizinkan build dari pohon kotor — label menjadi `<sha>-dirty` (jangan dipakai sebagai bukti uji; perbedaan tidak tercatat di commit).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "docker tidak ditemukan" >&2; exit 1; }
dirty="$(git status --porcelain | wc -l | tr -d ' ')"
if [ "$dirty" != "0" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "Pohon kerja TIDAK bersih ($dirty perubahan) — image tidak dapat dikaitkan dengan satu commit:" >&2
  git status --short >&2
  echo "Commit/simpan perubahan itu (konfigurasi server → deploy/.env, bukan edit berkas terlacak), atau ALLOW_DIRTY=1 (label -dirty)." >&2
  exit 1
fi
sha="$(git rev-parse HEAD)"; short="${sha:0:7}"; rev="$sha"; [ "$dirty" = "0" ] || rev="${sha}-dirty"
docker build --build-arg "GIT_SHA=$rev" -t "teone-app:staging-$short" -t teone-app:staging .
docker build --target tools --build-arg "GIT_SHA=$rev" -t "teone-tools:staging-$short" -t teone-tools:staging .
echo
echo "== PROVENANCE (salin ke catatan bukti uji; tanpa rahasia)"
echo "repository : $(git remote get-url origin 2>/dev/null | sed -E 's#(https?://)[^@/]+@#\1#')"
echo "commit     : $rev"
echo "cabang     : $(git branch --show-current)"
for img in "teone-app:staging-$short" "teone-tools:staging-$short"; do
  echo "image      : $img  id=$(docker image inspect "$img" --format '{{.Id}}')  revision-label=$(docker image inspect "$img" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
done
echo "jalankan   : TEONE_TAG=staging-$short docker compose -f deploy/docker-compose.staging.yml up -d app worker caddy"
