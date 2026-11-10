# SocialHub
Dashboard untuk mengelola dan mengotomasi akun YouTube, X, dan TikTok (Facebook ditunda). Arah produk: **dijual sebagai SaaS ke influencer/YouTuber** (multi-tenant: tiap pelanggan punya workspace sendiri, data terpisah).
Tiap pelanggan membawa developer app sendiri (Google Cloud, TikTok, X, kunci AI) dan menghubungkan Google Drive serta akun sosmed sendiri.

## Status (per akhir Oktober 2026)
- **YouTube**: paling lengkap. Upload terjadwal dari Google Drive, judul AI dari frame video, thumbnail otomatis, kategori/bahasa/playlist, komentar, Live 24/7.
- **X**: composer, autopilot, dan inbox sudah dibangun, tetapi belum dites dengan login nyata.
- **TikTok**: fitur upload sudah dibangun, tetapi belum dites dengan akun nyata; pemilik belum membuat developer app. Sebelum audit TikTok, unggahan hanya bisa SELF_ONLY.
- **Multi-tenant**: sudah berjalan (workspace, isolasi data, console admin, batas paket, signup mandiri lewat Google).
- **Clipper** (alur: link video → unduh → subtitle/terjemah → upload): langkah 1 (impor link TikTok/Facebook/Instagram/X) selesai; langkah 2 (terjemah subtitle) berikutnya; langkah 3 (tombol jadwalkan ke platform) lalu; langkah 4 (dubbing) ditunda.
- Belum ada: penagihan, enkripsi per-tenant, ekspor data lengkap.

## Risiko yang diketahui
Consent screen Google pelanggan memakai URL privasi domain gennexbyte.com (belum terbukti diterima Google); tiap app TikTok pelanggan butuh audit sendiri; kunci AI pelanggan harus API resmi; beban CPU/disk untuk Live 24/7.
