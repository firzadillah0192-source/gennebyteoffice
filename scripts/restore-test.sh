#!/bin/bash
# Membuktikan sebuah cadangan BISA dipulihkan: dipulihkan ke database sementara (office_restore_test), dihitung isinya, lalu dihapus. Tidak menyentuh database asli.
set -euo pipefail
F="${1:?pakai: scripts/restore-test.sh <berkas .sql.gz>}"; C=gennexbyteoffice-db-1
docker exec "$C" psql -U office -d postgres -qc "DROP DATABASE IF EXISTS office_restore_test" -c "CREATE DATABASE office_restore_test"
trap 'docker exec "$C" psql -U office -d postgres -qc "DROP DATABASE IF EXISTS office_restore_test" >/dev/null' EXIT
gunzip -c "$F" | docker exec -i "$C" psql -U office -d office_restore_test -q -v ON_ERROR_STOP=1 >/dev/null
echo "pulih ke database sementara. isi:"
docker exec "$C" psql -U office -d office_restore_test -Atc "select 'bots', count(*) from bots union all select 'rooms', count(*) from rooms union all select 'tasks', count(*) from tasks union all select 'ledger_entries', count(*) from ledger_entries union all select 'approvals', count(*) from approvals"
