// Definisi bot Ops: peran, prompt, dan tool-nya (semua baca-saja).
const urls = (process.env.OPS_URLS || "https://platform-socialhub.gennexbyte.com").split(",").map(s=>s.trim()).filter(Boolean);
import { execFile } from "node:child_process";
export const opsUrls = urls;
// Baca-saja: menjalankan /usr/local/bin/office-infra lewat sudo (aturan sudoers hanya mengizinkan skrip itu). Belum terpasang -> galat jelas.
export function infraSnapshot(jenis, baris = 30) {
  return new Promise((resolve) => {
    execFile("sudo", ["-n", "/usr/local/bin/office-infra", jenis, String(baris)], { timeout: 15000, maxBuffer: 200000 }, (err, out, errout) => {
      if (err) return resolve({ error: /password is required|not found|No such file/i.test(String(errout) + String(err.message)) ? "Alat infrastruktur belum dipasang admin (scripts/infra/install-infra.sh)." : String(errout || err.message).slice(0, 200) });
      resolve({ jenis, keluaran: String(out).slice(0, 3500) });
    });
  });
}
export const ops = {
  id: "ops-bot",
  system: `Kamu Ops, karyawan di kantor Gennexbyte yang memantau platform.
Kemampuanmu SAAT INI hanya satu: check_url, yaitu memeriksa apakah sebuah URL platform yang diizinkan hidup (kode HTTP, waktu respons, dan ke mana ia mengalihkan).
Kamu belum bisa: deploy, restart, membaca log, atau masuk ke server. Jangan berpura-pura bisa.
Aturan:
- Kalau tugas berupa pertanyaan tentang dirimu atau hal umum, jawab langsung lewat finish TANPA memanggil tool.
- Kalau tugas meminta pengecekan, gunakan check_url pada URL yang diizinkan dan laporkan hasil nyata, bukan tebakan. Kode 2xx = hidup. Redirect (3xx) yang berakhir di 2xx dalam host yang sama juga berarti hidup (sering ke halaman login).
- Kalau diminta mengecek URL yang tidak ada di daftar, katakan itu belum diizinkan.
- Kalau diminta memeriksa kondisi server (tunnel Cloudflare, kontainer, disk, memori, DNS), gunakan cek_infra. Itu hanya MEMBACA; kamu tidak bisa memperbaiki server. Laporkan temuan nyata dan sarankan langkah untuk admin; jangan menebak.
- Kalau diminta MEMPERBAIKI, mengubah, atau menyelidiki lebih dalam sesuatu di sebuah platform, jangan mencoba sendiri: gunakan tool teruskan_ke_engineer(platform, instruksi) agar Engineer platform itu yang menanganinya, lalu finish dengan menyebut Engineer-nya dan nomor tugas. Platform yang dikenal: socialhub, nxbooth, nxchat, gennexbyte. Kalau platformnya tidak jelas, tanyakan.
Selesaikan dengan finish berisi ringkasan singkat berbahasa Indonesia.
URL yang boleh diperiksa: ${urls.join(", ")}`,
  tools: [{
    name: "cek_infra",
    description: "Baca kondisi server (baca-saja). jenis: tunnel (status+log cloudflared) | kontainer (daftar kontainer docker) | disk | memori | dns. baris: jumlah baris log untuk tunnel (maks 100).",
    parameters: { type: "object", properties: { jenis: { type: "string", enum: ["tunnel", "kontainer", "disk", "memori", "dns"] }, baris: { type: "number" } }, required: ["jenis"] },
    async run({ jenis, baris }) { return infraSnapshot(jenis, baris || 30); },
  }, {
    name: "teruskan_ke_engineer",
    description: "Serahkan tugas perbaikan/penyelidikan ke Engineer platform. platform: socialhub | nxbooth | nxchat | gennexbyte. instruksi: apa yang harus dikerjakan (lengkap, mandiri).",
    parameters: { type: "object", properties: { platform: { type: "string", enum: ["socialhub", "nxbooth", "nxchat", "gennexbyte"] }, instruksi: { type: "string" } }, required: ["platform", "instruksi"] },
    async run({ platform, instruksi }, { def }) {
      const to = { socialhub: "engineer-socialhub", nxbooth: "engineer-nxbooth", nxchat: "engineer-nxchat", gennexbyte: "engineer-gennexbyte" }[platform];
      if (!to) return { error: "platform tidak dikenal" };
      const r = await fetch(`http://127.0.0.1:${process.env.OFFICE_PORT || 4100}/api/handoff`, { method: "POST", headers: { Authorization: `Bearer ${def.token}` }, body: JSON.stringify({ to, instruction: instruksi }) });
      const j = await r.json(); return r.ok ? { diteruskan_ke: to, tugas: j.task_id } : { error: j.error };
    },
  }, {
    name: "check_url",
    description: "Kirim HTTP GET ke salah satu URL platform yang diizinkan, kembalikan kode status dan waktu respons.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    async run({ url }) {
      if (!urls.includes(url)) return { error: "URL tidak diizinkan. Pilih dari: " + urls.join(", ") };
      const t0 = Date.now(), chain = []; let cur = url;
      try {
        for (let hop = 0; hop < 4; hop++) {
          const r = await fetch(cur, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000) });
          chain.push(r.status);
          const loc = r.headers.get("location");
          if (r.status >= 300 && r.status < 400 && loc) {
            const next = new URL(loc, cur);
            if (next.origin !== new URL(url).origin) return { url, final_status: r.status, redirects: chain, redirect_to_other_host: next.origin, ms: Date.now() - t0 };
            cur = next.href; continue;
          }
          return { url, final_status: r.status, final_path: new URL(cur).pathname, redirects: chain, ms: Date.now() - t0 };
        }
        return { url, error: "terlalu banyak redirect", redirects: chain, ms: Date.now() - t0 };
      } catch (e) { return { url, error: String(e.cause?.code || e.message).slice(0, 100), ms: Date.now() - t0 }; }
    },
  }],
};
