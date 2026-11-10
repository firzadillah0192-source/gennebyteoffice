#!/bin/bash
# Pasang alat infrastruktur baca-saja. Jalankan SATU KALI oleh admin: sudo ./install-infra.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }
D="$(cd "$(dirname "$0")" && pwd)"
install -o root -g root -m 0755 "$D/office-infra" /usr/local/bin/office-infra
install -o root -g root -m 0440 "$D/office-infra.sudoers" /etc/sudoers.d/office-infra
visudo -cf /etc/sudoers.d/office-infra >/dev/null || { rm -f /etc/sudoers.d/office-infra; echo "Aturan sudoers tidak valid; dibatalkan."; exit 1; }
echo "Terpasang. Uji sebagai user biasa: sudo -n office-infra memori"
