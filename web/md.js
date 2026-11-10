// Penampil Markdown ringan & AMAN: semua teks di-escape dulu, baru ditambah tag sendiri (tebal, kode, judul, daftar).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inline = (s) => {                                   // kode disimpan dulu, tebal diproses, lalu kode dikembalikan (supaya **...`kode`...** tetap benar)
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
};

export function md(src) {
  const lines = esc(src).replace(/\r/g, "").split("\n");
  let html = "", list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, ""); let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { close(); html += `<div class="mh">${inline(m[1])}</div>`; }
    else if ((m = line.match(/^(\s*)[-*•]\s+(.*)$/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li style="margin-left:${Math.min(m[1].length, 8) * 0.5}em">${inline(m[2])}</li>`; }
    else if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li value="${m[2]}" style="margin-left:${Math.min(m[1].length, 8) * 0.5}em">${inline(m[3])}</li>`; }
    else { close(); html += `<p>${inline(line.trim())}</p>`; }
  }
  close(); return html;
}

// Satu baris polos tanpa simbol Markdown (untuk feed, status, dan papan 3D).
export const plain = (s) => String(s ?? "").replace(/```[\s\S]*?```/g, " ").replace(/^\s*#{1,6}\s+/gm, "").replace(/^\s*[-*•]\s+/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
