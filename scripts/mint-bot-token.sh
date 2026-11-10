#!/usr/bin/env bash
# Membuat token baru untuk satu bot (token lama langsung tidak berlaku). Token tampil SEKALI di layar ini.
# Pakai: scripts/mint-bot-token.sh engineer-nxbooth
set -euo pipefail
BOT="${1:?isi id bot, mis. engineer-nxbooth}"
cd "$(dirname "$0")/.."
ADM=$(grep '^OFFICE_ADMIN_TOKEN=' .env | cut -d= -f2-)
PORT=$(grep '^OFFICE_PORT=' .env | cut -d= -f2- || true); PORT="${PORT:-4100}"
curl -fsS -X POST -H "Authorization: Bearer $ADM" "http://127.0.0.1:$PORT/api/bots/$BOT/token" | python3 -c "import sys,json;d=json.load(sys.stdin);print('Token untuk',d['bot'],':');print(d['token'])"
