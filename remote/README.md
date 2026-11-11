# Worker remote untuk VM platform (Engineer atau Operator)
1. Salin folder ini ke VM platform, lalu: `./install.sh`
2. Isi pertanyaan (alamat Office, ID bot, nama platform, folder aplikasi, token bot).
3. Selesai. Uji dari dashboard Office: beri tugas ke bot itu.
Berhenti/cabut: `systemctl --user disable --now office-worker` dan hapus token bot di Office.

## Operator VM (chat langsung)
Pilih jenis `operator` saat install, ID bot `operator-vm1` (VM1) atau `operator-vm2` (VM2), folder kerja bawaan home. Agent berjalan di dalam VM ini; dari web buka **Chat** → pilih Operator VM-nya. Membaca status/log langsung; perubahan selalu lewat persetujuan di ruang Director.
