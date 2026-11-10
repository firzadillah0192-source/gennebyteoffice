#!/bin/sh
# Pasang Office sebagai service user (hidup otomatis, termasuk setelah reboot). Jalankan sekali oleh pemilik.
set -e
mkdir -p ~/.config/systemd/user
cp "$(dirname "$0")"/office-*.service ~/.config/systemd/user/
# hentikan proses manual yang memegang port 4100 lebih dulu
systemctl --user daemon-reload
systemctl --user enable --now office-api.service office-worker.service
loginctl enable-linger "$USER"
systemctl --user is-active office-api office-worker
