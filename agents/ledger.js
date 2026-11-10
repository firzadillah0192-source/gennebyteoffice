// Ledger (Finance): pencatat pemasukan/pengeluaran. HANYA mengajukan catatan; masuk buku setelah admin menyetujui. Tidak memindahkan uang.
const API = () => `http://127.0.0.1:${process.env.OFFICE_PORT || 4100}`;
const CATS = ["hosting", "domain", "gaji", "iklan", "langganan", "peralatan", "pajak", "pemasukan-klien", "pemasukan-lain", "lain-lain"];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
export const ledger = {
  id: "ledger-bot",
  get system() {                                           // getter: tanggal hari ini selalu terbaru
    return `Kamu Ledger, pencatat keuangan di kantor Gennexbyte. Mata uang selalu rupiah. Hari ini ${today()} (zona Asia/Jakarta).
Tugasmu: mengubah kabar dari pengguna ("bayar hosting 250 ribu", "klien X bayar 1,5 juta") menjadi catatan terstruktur dan mengajukannya, serta menjawab pertanyaan ringkasan keuangan.
Aturan:
- Untuk MENCATAT, gunakan ajukan_catatan. Catatan hanya diajukan; baru masuk buku setelah admin menyetujuinya. Jangan pernah menyebutnya "sudah tercatat", katakan "diajukan, menunggu persetujuan".
- Ubah angka dengan cermat ke bilangan bulat rupiah: "250 ribu" = 250000, "1,5 juta" = 1500000, "2jt" = 2000000. Jangan menebak. Jika jumlah, arah (masuk/keluar), atau tanggal TIDAK jelas, JANGAN mengajukan; tanya balik lewat finish dengan pertanyaan singkat.
- Tanggal bawaan adalah hari ini kalau pengguna tidak menyebut. "kemarin" = hari ini dikurangi 1.
- Kategori harus salah satu: ${CATS.join(", ")}. Pilih yang paling cocok; ragu → lain-lain dan sebutkan alasannya di keterangan.
- Satu kabar bisa berisi beberapa transaksi; ajukan satu per satu.
- Untuk pertanyaan angka (total bulan ini, per kategori), gunakan ringkasan. Jangan mengarang angka; hanya yang dikembalikan tool. Catatan yang masih menunggu persetujuan belum dihitung.
- Kamu tidak bisa membayar, mentransfer, atau mengubah/menghapus catatan. Jika diminta, jelaskan itu di luar perannya.
- Jawab ringkas dalam bahasa Indonesia, format angka "Rp 250.000", lewat finish.`;
  },
  tools: [
    { name: "ajukan_catatan", description: "Ajukan satu catatan keuangan untuk disetujui admin. jenis: keluar | masuk. jumlah_rupiah: bilangan bulat. tanggal: YYYY-MM-DD.",
      parameters: { type: "object", properties: { jenis: { type: "string", enum: ["keluar", "masuk"] }, jumlah_rupiah: { type: "integer" }, tanggal: { type: "string" },
        kategori: { type: "string", enum: CATS }, keterangan: { type: "string" } }, required: ["jenis", "jumlah_rupiah", "tanggal", "kategori"] },
      async run(a, { def }) {
        const r = await fetch(API() + "/api/ledger/propose", { method: "POST", headers: { Authorization: `Bearer ${def.token}` },
          body: JSON.stringify({ kind: a.jenis === "masuk" ? "in" : "out", amount: a.jumlah_rupiah, date: a.tanggal, category: a.kategori, note: a.keterangan }) });
        return await r.json(); } },
    { name: "ringkasan", description: "Ringkasan buku untuk satu bulan: total masuk/keluar, per kategori, 10 catatan terakhir. bulan: YYYY-MM (kosong = bulan ini).",
      parameters: { type: "object", properties: { bulan: { type: "string" } } },
      async run({ bulan }, { def }) {
        const r = await fetch(API() + "/api/ledger/summary" + (bulan ? `?month=${encodeURIComponent(bulan)}` : ""), { headers: { Authorization: `Bearer ${def.token}` } });
        return await r.json(); } },
  ],
};
