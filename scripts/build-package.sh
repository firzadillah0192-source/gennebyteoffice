#!/usr/bin/env bash
# Membuat dist/office-worker.tgz (kode worker remote, TANPA rahasia apa pun).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/office-worker && mkdir -p dist/office-worker
cp agents/claude-engine.js agents/claude-flow.js agents/engineer-generic.js remote/remote-worker.js remote/install.sh remote/README.md remote/.env.example dist/office-worker/
echo '{"type":"module","private":true}' > dist/office-worker/package.json
tar -C dist -czf dist/office-worker.tgz office-worker
echo "OK: $(pwd)/dist/office-worker.tgz"; tar -tzf dist/office-worker.tgz
