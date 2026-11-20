#!/usr/bin/env bash
# Memasang gitleaks ber-pin (versi + checksum SHA-256 resmi rilis) agar pemindaian seluruh riwayat dapat dijalankan secara independen
# (mis. oleh auditor) tanpa gitleaks-action. Nilai versi/checksum HARUS sama dengan .github/workflows/ci.yml (dijaga test arsitektur).
#   bash scripts/install-gitleaks.sh [folder-tujuan]      # default: .tools/gitleaks (di-ignore git)
#   export PATH="$PWD/.tools/gitleaks:$PATH" && bash scripts/verify-all.sh
set -euo pipefail
GITLEAKS_VERSION="8.24.3"
GITLEAKS_SHA256="9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c"
DEST="${1:-.tools/gitleaks}"
mkdir -p "$DEST"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -sSfL -o "$tmp/gitleaks.tgz" "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
echo "${GITLEAKS_SHA256}  $tmp/gitleaks.tgz" | sha256sum --check --strict
tar -xzf "$tmp/gitleaks.tgz" -C "$DEST" gitleaks
"$DEST/gitleaks" version
echo "Terpasang di $DEST — tambahkan ke PATH: export PATH=\"$(cd "$DEST" && pwd):\$PATH\""
