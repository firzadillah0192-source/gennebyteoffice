#!/usr/bin/env bash
# Pasang worker Engineer di VM platform ini. Jalankan SEBAGAI USER BIASA (bukan root) dari folder paket.
set -euo pipefail
cd "$(dirname "$0")"; DIR="$(pwd)"
say() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Perlu '$1' tapi tidak ditemukan. $2"; exit 1; }; }
[ "$(id -u)" -ne 0 ] || { echo "Jalankan sebagai user biasa, jangan root."; exit 1; }

say "Memeriksa prasyarat"
need node "Pasang Node.js 20.6+ (mis. lewat nvm), lalu ulangi."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=6)?0:1)' || { echo "Node $(node -v) terlalu lama; perlu 20.6+."; exit 1; }
need git "Pasang git."
need claude "Pasang Claude Code di VM ini dan login dulu (jalankan 'claude' sekali), lalu ulangi."
echo "Node $(node -v), claude $(claude --version 2>/dev/null | head -1)"

say "Pengaturan"
[ -f .env ] && { echo "Ditemukan .env lama; dipakai ulang. Hapus file .env bila ingin mengisi ulang."; } || {
  read -r -p "Alamat Office [http://192.168.18.16:4100]: " URL; URL="${URL:-http://192.168.18.16:4100}"
  read -r -p "ID bot [engineer-nxbooth]: " BID; BID="${BID:-engineer-nxbooth}"
  read -r -p "Nama platform [NxBooth]: " PLAT; PLAT="${PLAT:-NxBooth}"
  read -r -p "Folder aplikasi di VM ini (path lengkap): " WD
  [ -d "$WD" ] || { echo "Folder '$WD' tidak ada."; exit 1; }
  read -r -s -p "Token bot (tempel; tidak terlihat): " TOK; echo
  [ -n "$TOK" ] || { echo "Token kosong."; exit 1; }
  umask 077
  sed -e "s|^OFFICE_URL=.*|OFFICE_URL=$URL|" -e "s|^BOT_ID=.*|BOT_ID=$BID|" -e "s|^PLATFORM=.*|PLATFORM=$PLAT|" -e "s|^WORKDIR=.*|WORKDIR=$WD|" -e "s|^BOT_TOKEN=.*|BOT_TOKEN=$TOK|" .env.example > .env
  chmod 600 .env
}
set -a; . ./.env; set +a
say "Menguji koneksi ke Office ($OFFICE_URL)"
curl -fsS -m 8 "$OFFICE_URL/api/health" >/dev/null || { echo "Tidak bisa menjangkau Office. Periksa alamat/jaringan/firewall."; exit 1; }
curl -fsS -m 8 -X POST -H "Authorization: Bearer $BOT_TOKEN" -d '{}' "$OFFICE_URL/api/tasks/claim" >/dev/null 2>&1 \
  && echo "Token diterima Office." || { echo "Token ditolak Office. Buat token baru di VM Office dan ulangi."; exit 1; }
git -C "$WORKDIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 && echo "Folder aplikasi adalah repositori git: perubahan kode bisa diajukan lewat persetujuan." \
  || echo "PERINGATAN: folder aplikasi bukan repositori git, jadi hanya penyelidikan baca-saja."

say "Memasang service (hidup otomatis)"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/office-worker.service" <<UNIT
[Unit]
Description=Gennexbyte Office worker ($BOT_ID)
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) --env-file=.env remote-worker.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now office-worker.service
loginctl enable-linger "$USER" 2>/dev/null || echo "(Tidak bisa mengaktifkan linger otomatis; jalankan: sudo loginctl enable-linger $USER agar hidup setelah reboot.)"
sleep 3; systemctl --user is-active office-worker.service && echo "Worker aktif. Cek di dashboard Office: bot $BOT_ID seharusnya tampil online."
echo "Log: journalctl --user -u office-worker -f"
