#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/5] Running the complete automated test suite"
npm test

echo "[2/5] Building reviewable deployment packages"
npm run package
python3 scripts/test_package.py

echo "[3/5] Checking the Alexa-hosted archive layout"
actual="$(unzip -Z1 dist/evoll-alexa-hosted.zip | sort | tr '\n' ' ')"
expected="lambda/index.js lambda/package.json "
if [[ "$actual" != "$expected" ]]; then
  echo "Unexpected Alexa archive content: $actual" >&2
  exit 1
fi

echo "[4/5] Checking that deployment archives contain no secret files"
archive_names="$({
  unzip -Z1 dist/evoll-lambda.zip
  unzip -Z1 dist/evoll-alexa-hosted.zip
  tar -tzf dist/evoll-linking.tar.gz
  tar -tzf dist/evoll-docker.tar.gz
} | tr '[:upper:]' '[:lower:]')"
forbidden='(^|/)(\.env(\..*)?|id_rsa|id_ed25519|credentials(\..*)?|.*\.(pem|key|p12|sqlite|sqlite3|db))$'
unexpected="$(grep -Ev '(^|/)(\.env\.example|\.env\.compose\.example)$' <<<"$archive_names" || true)"
if grep -Eq "$forbidden" <<<"$unexpected"; then
  echo "A deployment archive contains a forbidden secret file:" >&2
  grep -E "$forbidden" <<<"$unexpected" >&2
  exit 1
fi

echo "[5/5] Recording artifact hashes"
sha256sum \
  dist/evoll-lambda.zip \
  dist/evoll-alexa-hosted.zip \
  dist/evoll-docker.tar.gz \
  dist/evoll-linking.tar.gz \
  assets/alexa/evoll-alexa-108.png \
  assets/alexa/evoll-alexa-512.png \
  | tee dist/SHA256SUMS

echo "Release preflight passed. Review docs/release-checklist.md before deployment."
