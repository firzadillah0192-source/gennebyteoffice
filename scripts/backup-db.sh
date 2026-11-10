#!/bin/bash
# Cadangan database Office -> ~/office-backups/office-YYYYmmdd-HHMMSS.sql.gz (izin 600, folder 700). Simpan OFFICE_BACKUP_KEEP berkas terbaru.
set -euo pipefail
DIR="${OFFICE_BACKUP_DIR:-$HOME/office-backups}"; KEEP="${OFFICE_BACKUP_KEEP:-14}"
umask 077; mkdir -p "$DIR"; chmod 700 "$DIR"
F="$DIR/office-$(date +%Y%m%d-%H%M%S).sql.gz"; TMP="$F.part"
trap 'rm -f "$TMP"' EXIT
docker exec gennexbyteoffice-db-1 pg_dump -U office --no-owner --clean --if-exists office | gzip -9 > "$TMP"   # pipefail: gagal dump = gagal skrip
gzip -t "$TMP"                                                    # arsip utuh?
[ "$(stat -c%s "$TMP")" -gt 1500 ] || { echo "cadangan terlalu kecil, dibatalkan" >&2; exit 1; }
mv "$TMP" "$F"; trap - EXIT
ls -1t "$DIR"/office-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$F $(stat -c%s "$F")"
