// Resepsionis: menjawab pertanyaan tentang Gennexbyte dari data hidup kantor + berkas pengetahuan. Hanya BACA, tidak bertindak.
import { readFile, readdir } from "node:fs/promises"; import path from "node:path"; import { fileURLToPath } from "node:url";
const KNOW = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const API = `http://127.0.0.1:${process.env.OFFICE_PORT || 4100}`, ADMIN = process.env.OFFICE_ADMIN_TOKEN;
const get = async (p) => (await fetch(API + p, { headers: { Authorization: `Bearer ${ADMIN}` } })).json();
const clip = (o, n = 6000) => { const s = JSON.stringify(o); return s.length > n ? s.slice(0, n) + "…(dipotong)" : s; };

export const receptionist = {
  id: "receptionist-bot",
  system: `Kamu Resepsionis di Lobi kantor Gennexbyte. Kamu menjawab pertanyaan pemilik dan tim tentang seluruh Gennexbyte: platform, ruangan, karyawan (bot), status, dan hasil kerja.
Sumbermu: tool office_overview (ruangan, karyawan, status saat ini), recent_work (tugas dan hasil 5 hari terakhir), dan read_knowledge (berkas pengetahuan tentang produk; mulai dari nama "gennexbyte").
Aturan:
- Jawab berdasarkan data dari tool. Jangan mengarang. Kalau datanya tidak ada, katakan "belum tercatat" dan sebut siapa/ruangan mana yang bisa ditanya.
- Kamu hanya menjawab dan mengarahkan; kamu tidak menjalankan tindakan. Untuk tindakan, sarankan karyawan atau ruangan yang tepat.
- Panggil tool seperlunya (maksimal 3). Jawaban singkat, berbahasa Indonesia, dalam finish.
- Jangan pernah menampilkan token, password, atau kunci.`,
  tools: [
    { name: "office_overview", description: "Daftar ruangan, karyawan (nama, peran, ruangan), status dan langkah terakhir masing-masing.",
      parameters: { type: "object", properties: {} },
      async run() { const s = await get("/api/state?since=-1");
        return clip({ ruangan: s.rooms.map((r) => ({ id: r.id, nama: r.name })),
          karyawan: Object.values(s.bots).map((b) => ({ nama: b.name, peran: b.role, ruangan: b.room, status: b.effective_status, langkah: b.step, update: b.updated_at })),
          menunggu_persetujuan: s.approvals.length }); } },
    { name: "recent_work", description: "Tugas dan hasil kerja 5 hari terakhir. Isi room dengan id ruangan (mis. socialhub, finance, other-apps) atau 'lobby' untuk semua.",
      parameters: { type: "object", properties: { room: { type: "string" } } },
      async run({ room }) { const d = await get(`/api/board?room=${encodeURIComponent(room || "lobby")}`);
        return clip({ disimpan_hari: d.retention_days, tugas: d.tasks.slice(0, 15).map((t) => ({ bot: t.bot, status: t.state, waktu: t.created_at, instruksi: String(t.instruction).slice(0, 160), hasil: t.result ? String(t.result).slice(0, 400) : null })) }); } },
    { name: "read_knowledge", description: "Baca berkas pengetahuan tentang produk Gennexbyte. name: gennexbyte, socialhub, atau office.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      async run({ name }) { const files = (await readdir(KNOW)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
        if (!files.includes(name)) return { error: "tidak ada", tersedia: files };
        return { name, isi: (await readFile(path.join(KNOW, name + ".md"), "utf8")).slice(0, 5000) }; } },
  ],
};
