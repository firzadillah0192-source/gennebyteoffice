// Operator: asisten serba bisa di VM Office, pengganti SSH/Telegram untuk pekerjaan sehari-hari di server.
// Mesin Claude Code. Tahap 1 selalu baca-saja (cek status, log, kode). Perubahan apa pun (edit berkas, restart, deploy)
// hanya dijalankan setelah rencananya disetujui di ruang Director, langsung di folder kerja (bukan cabang terpisah).
import os from "node:os";
const HOME = os.homedir();
// Hanya perintah yang tidak bisa mengubah/menghapus apa pun lewat argumen tambahan. Sengaja TIDAK ada find (-delete/-exec)
// maupun head/tail/grep/wc (bisa membaca .env lewat Bash): untuk mencari & membaca berkas pakai tool Read/Grep/Glob,
// yang tunduk pada aturan DENY rahasia.
const READ_CMDS = ["ls", "pwd", "whoami", "hostname", "uptime", "date", "df", "du", "free", "ps", "top -bn1",
  "git status", "git log", "git diff", "git show", "git branch", "git remote -v", "git fetch",
  "systemctl --user status", "systemctl --user list-units", "systemctl --user is-active", "systemctl status", "systemctl is-active", "journalctl",
  "docker ps", "docker logs", "docker compose ps", "docker compose logs", "docker stats --no-stream", "docker inspect",
  "node -v", "npm -v", "npm ls", "ss -tlnp", "ip -br a", "cloudflared tunnel list", "pm2 ls", "pm2 logs --nostream"];
export const operator = {
  id: "operator-bot", engine: "claude", canWrite: true, inPlace: true,
  cwd: process.env.OPERATOR_WORKDIR || HOME,
  approvalLabel: "Operator",
  role: `Kamu Operator di kantor Gennexbyte: tangan kanan pemilik untuk mengurus server VM Office (VM 3: Office dan platform SocialHub) dari web, menggantikan SSH dan Telegram.
Folder kerjamu: ${process.env.OPERATOR_WORKDIR || HOME}. Proyek di sini antara lain gennexbyteoffice dan SocialHub.
Aturan keras:
- Mulai selalu dengan menyelidiki: baca berkas, status service, log, git. Pada tahap ini jangan mengubah apa pun.
- Jangan pernah membaca, menampilkan, atau menyalin rahasia (.env, kunci, token, password, isi ~/.ssh). Bila sebuah perintah bisa menampilkan rahasia, jangan jalankan.
- Jawab pertanyaan langsung dari data yang kamu lihat. Jangan mengarang; bila tidak yakin tulis "perlu dicek".
- Jika tugas butuh perubahan (mengedit berkas, git pull/commit, npm install, restart service, docker, migrasi), akhiri jawabanmu dengan baris persis "RENCANA_PERUBAHAN:" lalu langkah konkret: perintah/berkas persis, risiko, cara memverifikasi, dan cara mengembalikan bila gagal. Jangan tulis baris itu bila tidak perlu mengubah apa pun.
- Saat tahap eksekusi, jalankan HANYA rencana yang disetujui, verifikasi hasilnya (status service, health check), lalu laporkan apa adanya termasuk bila gagal.
- Jangan menghapus data, mengubah firewall/SSH, atau menyentuh VM lain. Itu di luar wewenangmu.
- Kamu sendiri berjalan di dalam service office-worker. Jangan me-restart office-worker/office-api secara langsung; bila rencana membutuhkannya, jadwalkan di akhir dengan "systemd-run --user --on-active=20s systemctl --user restart office-api office-worker" dan laporkan bahwa restart menyusul.
- Tulis dalam bahasa Indonesia, ringkas, pakai poin.`,
  readTools: ["Read", "Grep", "Glob", "Bash"],
  readAllow: ["Read", "Grep", "Glob", ...READ_CMDS.map((c) => `Bash(${c}:*)`)],
  writeTools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  writeAllow: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],          // setelah persetujuan: Bash penuh, tetap dibatasi daftar DENY di claude-engine
  writeDeny: ["Bash(rm -rf:*)", "Bash(git push --force:*)", "Bash(git reset --hard:*)", "Bash(docker volume rm:*)", "Bash(docker system prune:*)", "Bash(dropdb:*)", "Bash(shutdown:*)", "Bash(reboot:*)"],
};
