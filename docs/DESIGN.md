# Gennexbyte Office — rancangan awal

Situs: office.gennexbyte.com. Simulasi kantor 3D, **satu lantai** berisi banyak ruangan.
Referensi gaya: dashboard "Grok Bot" (kantor 3D, polling `api/state`). Hanya inspirasi; jangan salin kode/aset tanpa cek lisensi.

## Navigasi
1. **Lobi** (ballroom/resepsionis): ruang utama, tampak seluruh lantai.
2. Klik ruangan di denah → masuk ke ruangan itu (kamera zoom, panel bot).
3. Tiap ruangan punya tema sendiri.

## Ruangan
| id | Nama | Jenis | Tema |
|---|---|---|---|
| lobby | Lobi | utama | ballroom / resepsionis |
| gennexbyte | Gennexbyte | platform | markas teknologi: server rack, layar kode, lampu neon biru |
| nxchat | NxChat | platform | lounge santai / call center modern: sofa, bubble pesan, headset |
| nxbooth | NxBooth | platform | studio foto |
| socialhub | SocialHub | platform | studio siaran: mikrofon, lampu ON AIR, dinding layar sosmed (Marketing menumpang di sini) |
| other-apps | Lab Aplikasi | platform | lab pengembangan: dinding ide + sticky notes, meja cetak biru, bohlam ide, rak prototipe; bot Ideator brainstorming aplikasi baru |
| finance | Finance | departemen | bank / ruang brankas: pintu brankas, tumpukan koin, kalkulator, grafik naik-turun; mengendalikan aplikasi finance |
| marketing | Marketing | departemen | agensi kreatif: papan moodboard, billboard mini, megafon; promosi lewat SocialHub |
| director | Director | departemen | ruang rapat eksekutif: meja panjang, kursi kulit, layar besar; tempat manusia berkumpul + antrean persetujuan |

## Karyawan (agent)
Tiap bot punya: `name`, `role`, `room`, `look` (bentuk/warna/aksesori), `backend`
(`router` = 9router cx/, `claude` = Claude Code headless), `chat_url`.
Status: `working | idle | waiting_user | error | done`.
Aksi keluar (posting, upload, uang) → berhenti di `waiting_user` sampai disetujui di ruang Director.

## Kontrak data (server sendiri, bukan ntfy publik)
- `POST /api/event` (token per bot): `{bot, status, step}` · `{roster}` · `{looks}` · `{routines}` · `{usage}`
- `GET /api/state?since=<version>` → `{version, rooms[], bots{}, approvals[]}`
- Disimpan di database (tidak hilang 12 jam).

## Aturan
- Hanya model `cx/*` di 9router; beban AI dibatasi (lihat memori `feedback-9router-cx-models-only`).
- Rahasia hanya di `.env`; tidak pernah diposting ke feed.

## Tahap
1. Uji tool calling `cx/` (`scripts/test-toolcall.mjs`).
2. Server + DB + `/api/event` `/api/state`.
3. Agent pertama (zona SocialHub), lalu worker + antrean tugas.
4. Dashboard 2D sederhana → denah 3D lobi → ruangan bertema.

## Otonomi karyawan (instruksi tetap + rutinitas)
Setiap karyawan bekerja sendiri berdasarkan **instruksi** yang ditetapkan pemilik, bukan hanya saat disuruh:
- **Instruksi tetap** (`bots.standing`): seperti "Instructions" di GPTs; ditambahkan ke prompt peran untuk SEMUA tugas karyawan itu.
- **Rutinitas** (`routines`): nama + instruksi + interval (min. 1 jam, maks. 7 hari) + jam aktif WIB (bawaan 07–22). Penjadwal server membuat tugas biasa (`tasks.routine_id`) saat jatuh tempo; hasilnya tampil di papan ruangan dengan label "otomatis".
- **Rem pengaman:** semua rutinitas contoh NONAKTIF sampai pemilik menyalakannya; batas harian tugas otomatis (bawaan 30); tombol "Otomatis" menjeda semuanya; satu rutinitas tidak menumpuk (dilewati bila masih antre/berjalan); maks. 5 rutinitas per karyawan; karyawan yang belum punya kemampuan kerja ditolak.
- Diatur dari layar **Atur** pada kartu karyawan (admin). Tamu tidak melihat instruksi tetap maupun rutinitas.

## Kontrol tugas dari web (tanpa SSH/Telegram)
Setiap tugas punya layar **Detail** (tombol "Detail / balas" di papan, "Detail & log" di kartu karyawan; terbuka otomatis setelah mengirim tugas):
- **Log langkah live**: `task_logs` diisi worker lewat `POST /api/tasks/:id/log` (langkah, tool yang dipakai, catatan AI). Mesin Claude memakai `--output-format stream-json` sehingga tiap tool Claude tampil saat terjadi. Teks disamarkan (`redact`) sebelum dikirim.
- **Hentikan**: `POST /api/tasks/:id/stop` (admin). Antre → langsung `cancelled`. Berjalan → `stop_requested_at` diisi; worker mengecek tiap ~4 detik (`/control`), memutus panggilan AI / mematikan proses `claude`, lalu menutup tugas sebagai `stopped`. Bila worker tidak merespons > 1 menit, tombol "Hentikan paksa" menutup catatannya saja.
- **Balas / lanjutkan**: `POST /api/tasks` dengan `parent_id` membuat tugas lanjutan untuk karyawan yang sama. Saat diambil, server mengirim `context` (maks. 4 tugas sebelumnya: instruksi + hasil) yang ditaruh worker di depan pesan baru.
- Worker lama (VM lain) tetap jalan tanpa pembaruan: log dan stop hanya aktif setelah paket `dist/office-worker.tgz` terbaru dipasang.

## Operator (pengganti SSH/Telegram)
Karyawan `operator-bot` di ruang Director, mesin Claude Code, folder kerja `OPERATOR_WORKDIR` (bawaan: home user).
- **Tahap baca** (tanpa persetujuan): baca berkas, git, `systemctl --user status`, `journalctl`, `docker ps/logs`, `df`, `free`, dan sejenisnya. Cocok untuk "cek kenapa SocialHub lambat", "lihat log worker 1 jam terakhir".
- **Tahap ubah**: bila perlu mengubah sesuatu, Operator menulis `RENCANA_PERUBAHAN` → muncul di antrean persetujuan Director ("Jalankan di server: …"). Setelah disetujui, rencana dijalankan **langsung di folder kerja** (bukan cabang terpisah) dengan Bash penuh, tetap dibatasi daftar DENY (rahasia, rm, curl, ssh, sudo, dst.) dan `writeDeny` Operator (reset --hard, force push, prune, reboot).
- Restart service Office sendiri dijadwalkan lewat `systemd-run --user --on-active=20s` agar tidak memutus tugas yang sedang berjalan.
- Percakapan lanjutan, log live, dan tombol Hentikan memakai fitur Kontrol tugas di atas.

## Chat langsung ke agent (halaman `chat.html`)
Tombol **Chat** di topbar dan di kartu karyawan membuka halaman chat penuh.
- **Banyak percakapan per agent** (`chat_sessions`), daftar di kiri. Setiap pesan = satu tugas biasa (`tasks.chat_session_id`), jadi antrean, log, Stop, dan persetujuan tetap sama.
- **Sesi nyambung seperti SSH**: untuk mesin Claude, sesi disimpan (tanpa `--no-session-persistence`) dan pesan berikutnya memakai `--resume <session_id>`, sehingga agent mengingat seluruh percakapan. Bot non-Claude memakai konteks tugas sebelumnya.
- **Live**: `GET /api/chat/:bot/stream?session=&after=` mengalirkan NDJSON (log baru, perubahan status pesan, status bot) selama 10 menit lalu klien menyambung ulang.
- **Persetujuan di tempat**: rencana perubahan muncul sebagai kartu di dalam chat dengan tombol Setujui/Tolak.
- **Agent di dalam VM-nya**: `operator-vm1` (ruang Gennexbyte) dan `operator-vm2` (ruang NxChat) dijalankan oleh worker remote dengan `AGENT_KIND=operator` di VM masing-masing (lihat `remote/README.md`).
- Riwayat pesan mengikuti masa simpan tugas (`OFFICE_RETENTION_DAYS`).
