// Chat langsung ke agent: rail agent + daftar percakapan, jawaban & langkah agent mengalir live (NDJSON), Stop, persetujuan di tempat.
import { md, esc } from "./md.js";

const $ = (id) => document.getElementById(id);
const store = { get: () => { try { return localStorage.getItem("office.token"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("office.token", v); } catch {} } };
let token = store.get();
const H = () => ({ Authorization: `Bearer ${token}` });
const api = async (path, opt = {}) => { const r = await fetch(path, { ...opt, headers: { ...H(), ...(opt.headers || {}) } });
  if (r.status === 401) { askLogin(); throw new Error("butuh login"); } return r; };
const hm = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const OPEN = new Set(["queued", "running"]);
const Q = new URLSearchParams(location.search);
const ICON = { chev: `<svg class="chev" viewBox="0 0 24 24" width="14" height="14"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ok: `<svg class="ok" viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bad: `<svg class="bad" viewBox="0 0 24 24" width="15" height="15"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="13" height="13"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>` };

const mdx = (src) => String(src ?? "").split(/```[^\n]*\n?/).map((part, i) => i % 2 ? `<pre>${esc(part.replace(/\n$/, ""))}</pre>` : md(part)).join("");
// Inisial yang tidak bentrok: Operator → V3/V1/V2 (VM-nya), "NxBooth Engineer" → NB, "SocialHub Engineer" → SH, lainnya dua huruf awal.
const initials = (name, id = "") => {
  if (id === "operator-bot") return "V3";
  const w = String(name).trim().split(/\s+/), vm = w.at(-1).match(/^VM(\d+)$/i); if (vm) return "V" + vm[1];
  const caps = w[0].match(/[A-Z]/g) || [];
  return (w.length > 1 && caps.length >= 2 ? caps[0] + caps[1] : w.length > 1 && /engineer/i.test(w.at(-1)) ? w[0].slice(0, 2) : w[0].slice(0, 2)).toUpperCase();
};
const online = (b) => !b.remote || (b.seen_ms != null && b.seen_ms < 120000);
const stOf = (b) => online(b) ? b.effective_status : "offline";
const STWORD = { working: "sedang bekerja", idle: "siap", waiting_user: "menunggu persetujuanmu", error: "ada kendala", done: "siap", offline: "offline" };
const av = (b, cls = "") => `<span class="av ${cls}" style="--c:${esc(b?.look?.color || "#5b9dff")}">${esc(initials(b?.name || "?", b?.id))}${cls.includes("sm") ? "" : `<i class="${esc(stOf(b || {}))}"></i>`}</span>`;
const dur = (a, b) => { const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000)); return s < 60 ? `${s} dtk` : s < 3600 ? `${Math.round(s / 60)} mnt` : `${(s / 3600).toFixed(1)} jam`; };

let bots = {}, botId = null, session = null, msgs = new Map(), approvals = [], streamCtl = null, lastLog = 0, sessionsCache = [];
const opened = new Set();                                         // kartu aktivitas yang sedang dibuka pengguna

function askLogin() { $("login").hidden = false; $("token").focus(); }
$("login-form").onsubmit = async (e) => {
  e.preventDefault(); token = $("token").value.trim();
  const r = await fetch("/api/state", { headers: H() });
  if (!r.ok) { $("login-err").textContent = "Token salah."; return; }
  store.set(token); $("login").hidden = true; boot();
};

// ---------- rail agent ----------
async function loadBots() {
  const s = await (await api("/api/state")).json();
  bots = s.bots; approvals = s.approvals || []; paintRail(); paintHead();
}
function paintRail() {
  const all = Object.values(bots).filter((b) => b.id !== "clipper-bot");
  const ops = all.filter((b) => b.id.startsWith("operator")).sort((a, b) => a.name.localeCompare(b.name));
  const rest = all.filter((b) => !b.id.startsWith("operator")).sort((a, b) => a.name.localeCompare(b.name));
  const btn = (b) => `<button data-bot="${esc(b.id)}" class="${b.id === botId ? "on" : ""}" title="${esc(b.name)} · ${esc(STWORD[stOf(b)] || stOf(b))}">${av(b)}</button>`;
  const html = ops.map(btn).join("") + (ops.length && rest.length ? `<div class="sep"></div>` : "") + rest.map(btn).join("");
  if ($("rail").__h !== html) { $("rail").__h = html; $("rail").innerHTML = html;
    $("rail").querySelectorAll("[data-bot]").forEach((x) => x.onclick = () => selectBot(x.dataset.bot)); }
}
function paintHead() {
  const b = bots[botId]; if (!b) return;
  $("head-av").outerHTML = `<span id="head-av" class="av" style="--c:${esc(b.look?.color || "#5b9dff")}">${esc(initials(b.name, b.id))}<i class="${esc(stOf(b))}"></i></span>`;
  $("title").textContent = session?.title || b.name;
  $("sub").innerHTML = `<span>${esc(b.name)}</span><span class="pill ${esc(stOf(b))}">${esc(STWORD[stOf(b)] || stOf(b))}</span>`;
  $("side-name").textContent = b.name; $("side-role").textContent = b.role;
  $("banner").hidden = online(b);
  $("banner").textContent = `${b.name} belum terhubung: worker di VM-nya belum menyala. Pesan tetap disimpan dan dikerjakan begitu worker terhubung.`;
}

// ---------- percakapan ----------
async function selectBot(id, sessionId) {
  if (!bots[id]) id = Object.keys(bots).find((k) => k.startsWith("operator")) || Object.keys(bots)[0];
  botId = id; session = null; msgs.clear(); opened.clear(); lastLog = 0;
  history.replaceState(null, "", `?bot=${encodeURIComponent(id)}${sessionId ? `&session=${sessionId}` : ""}`);
  paintRail(); paintHead(); await loadChat(sessionId);
}
async function loadChat(sessionId) {
  stopStream();
  const d = await (await api(`/api/chat/${encodeURIComponent(botId)}${sessionId ? `?session=${sessionId}` : ""}`)).json();
  if (d.error) { $("log").innerHTML = `<div class="empty-state"><p>${esc(d.error)}</p></div>`; return; }
  session = d.session; msgs.clear();
  for (const m of d.messages) msgs.set(m.id, m);
  lastLog = d.last_log || 0;
  paintSessions(d.sessions); paintHead(); renderAll();
  if (session) startStream();
}
function dayGroup(iso) { const d = new Date(iso), n = new Date(); const diff = Math.floor((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5);
  return diff <= 0 ? "Hari ini" : diff === 1 ? "Kemarin" : diff < 7 ? "7 hari terakhir" : "Lebih lama"; }
function paintSessions(list) {
  sessionsCache = list; let grp = "", html = "";
  for (const s of list) {
    const g = dayGroup(s.last_at); if (g !== grp) { grp = g; html += `<div class="grp">${g}</div>`; }
    html += `<div class="s ${session?.id === s.id ? "on" : ""}" data-id="${s.id}" title="${esc(s.title || "Percakapan baru")}">
      ${s.busy ? `<i class="busy" title="Agent sedang bekerja"></i>` : ""}<span>${esc(s.title || "Percakapan baru")}</span>
      <button class="x" data-close="${s.id}" title="Sembunyikan" aria-label="Sembunyikan percakapan">${ICON.x}</button></div>`;
  }
  $("sessions").innerHTML = html || `<div class="empty">Belum ada percakapan. Tulis pesan untuk memulai.</div>`;
  $("sessions").querySelectorAll(".s").forEach((el) => el.onclick = (e) => {
    if (e.target.closest("[data-close]")) return; closeMenu(); selectBot(botId, Number(el.dataset.id));
  });
  $("sessions").querySelectorAll("[data-close]").forEach((b) => b.onclick = async () => {
    if (!confirm("Sembunyikan percakapan ini dari daftar?")) return;
    await api(`/api/chat/${encodeURIComponent(botId)}/close?session=${b.dataset.close}`, { method: "POST" });
    const id = Number(b.dataset.close); selectBot(botId, session?.id === id ? null : session?.id);
  });
}

// ---------- pesan ----------
const SUGGEST = {
  operator: [["Cek status semua service", "systemd, docker, dan port yang terbuka"], ["Lihat error di log 1 jam terakhir", "journalctl & log aplikasi"],
    ["Sisa disk dan memori", "df, free, proses terbesar"], ["Apa saja yang jalan di VM ini?", "ringkasan aplikasi & service"]],
  engineer: [["Cari penyebab error terakhir", "dari log & riwayat git"], ["Ringkas perubahan minggu ini", "git log"]],
  "ledger-bot": [["Ringkasan keuangan bulan ini", "masuk, keluar, selisih"]], "ideator-bot": [["3 ide fitur baru untuk SocialHub", "lengkap dengan risiko"]],
  "receptionist-bot": [["Rangkum aktivitas kantor hari ini", "per ruangan"]], "social-bot": [["Buat 2 draf caption X", "untuk mengenalkan SocialHub"]],
  "ops-bot": [["Cek semua platform hidup", "uptime & status"]],
};
const suggestFor = (id) => SUGGEST[id] || (id.startsWith("operator") ? SUGGEST.operator : id.startsWith("engineer") ? SUGGEST.engineer : []);
function emptyHtml() {
  const b = bots[botId] || {};
  return `<div class="empty-state">${av(b, "lg")}<h2>${esc(b.name || "")}</h2><p>${esc(b.role || "")}</p>
    <p style="font-size:13px">Percakapan diingat sampai kamu membuat percakapan baru. Membaca status & log langsung jalan; perubahan di server menunggu persetujuanmu.</p>
    ${suggestFor(botId).length ? `<div class="chips">${suggestFor(botId).map(([t, s]) => `<button data-suggest="${esc(t)}">${esc(t)}<small>${esc(s)}</small></button>`).join("")}</div>` : ""}</div>`;
}
const visibleLogs = (m) => (m.logs || []).filter((l) => l.kind !== "system");
function nowLine(m) {
  const l = visibleLogs(m).at(-1);
  if (!l) return m.state === "queued" ? "Menunggu giliran…" : "Memulai…";
  return l.kind === "tool" ? `<code>${esc(l.text)}</code>` : esc(l.text.split("\n")[0]);
}
function actHtml(m) {
  const n = visibleLogs(m).length, open = OPEN.has(m.state);
  if (!open && !n) return "";
  const head = open ? `<span class="spin"></span><span class="now">${nowLine(m)}</span><span>${n ? n + " langkah" : ""}</span>`
    : `${m.state === "done" ? ICON.ok : ICON.bad}<span class="now">${m.state === "done" ? "Selesai" : m.state === "stopped" ? "Dihentikan" : m.state === "cancelled" ? "Dibatalkan" : "Gagal"}${m.started_at && m.finished_at ? " dalam " + dur(m.started_at, m.finished_at) : ""}</span><span>${n} langkah</span>`;
  return `<details class="act" data-act="${m.id}" ${opened.has(m.id) ? "open" : ""}><summary>${head}${ICON.chev}</summary>
    <div class="steps">${(m.logs || []).map(stepHtml).join("")}</div></details>`;
}
const stepHtml = (l) => `<div class="${esc(l.kind)}"><time>${esc(hm(l.at))}</time><span>${esc(l.text)}</span></div>`;
function msgHtml(m) {
  const b = bots[botId], ap = approvals.find((a) => Number(a.detail?.task) === m.id), open = OPEN.has(m.state);
  return `<div class="u">${esc(m.instruction)}</div>
    <div class="a" data-msg="${m.id}">${av(b, "sm")}<div class="body">
      <div class="meta"><b>${esc(b?.name || "Agent")}</b><span>${esc(hm(m.created_at))}</span>${m.stop_requested_at && open ? "<span>· menghentikan…</span>" : ""}</div>
      ${actHtml(m)}
      ${ap ? `<div class="approve"><div class="t">${ICON.shield} Butuh persetujuanmu</div><div class="act-name">${esc(ap.action)}</div><pre>${esc(ap.detail?.plan || "")}</pre>
        <div class="row"><button class="ok" data-ap="${ap.id}" data-do="approve">Setujui & jalankan</button><button data-ap="${ap.id}" data-do="reject">Tolak</button></div></div>` : ""}
      ${m.result ? `<div class="out ${esc(m.state)}">${mdx(m.result)}</div>` : open && !ap && !actHtml(m) ? `<div class="thinking"><i></i><i></i><i></i></div>` : ""}
    </div></div>`;
}
function renderAll() {
  const log = $("log");
  log.innerHTML = !session || !msgs.size ? emptyHtml() : `<div class="thread">${[...msgs.values()].map(msgHtml).join("")}</div>`;
  wire(log); toBottom(); syncControls();
}
function renderMsg(id) {
  const m = msgs.get(id), el = $("log").querySelector(`[data-msg="${id}"]`);
  if (!m || !el) return renderAll();
  const near = nearBottom(), steps = el.querySelector(".steps"), keep = steps?.scrollTop ?? 0;
  const tmp = document.createElement("div"); tmp.innerHTML = msgHtml(m);
  const fresh = tmp.querySelector(".a"); el.replaceWith(fresh); wire(fresh);
  const ns = fresh.querySelector(".steps"); if (ns) ns.scrollTop = OPEN.has(m.state) ? ns.scrollHeight : keep;
  if (near) toBottom(); syncControls();
}
function wire(root) {
  root.querySelectorAll("details.act").forEach((d) => d.ontoggle = () => { const id = Number(d.dataset.act); d.open ? opened.add(id) : opened.delete(id);
    if (d.open) { const s = d.querySelector(".steps"); s.scrollTop = s.scrollHeight; } });
  root.querySelectorAll("[data-ap]").forEach((b) => b.onclick = async () => {
    b.closest(".row").querySelectorAll("button").forEach((x) => x.disabled = true);
    await api(`/api/approval/${b.dataset.ap}/${b.dataset.do}`, { method: "POST" });
    approvals = approvals.filter((a) => String(a.id) !== b.dataset.ap); renderMsg(Number(b.closest("[data-msg]").dataset.msg));
  });
  root.querySelectorAll("[data-suggest]").forEach((b) => b.onclick = () => { text.value = b.dataset.suggest; grow(); text.focus(); });
}
const nearBottom = () => { const l = $("log"); return l.scrollTop + l.clientHeight >= l.scrollHeight - 120; };
const toBottom = () => { const l = $("log"); l.scrollTop = l.scrollHeight; };
const active = () => [...msgs.values()].reverse().find((m) => OPEN.has(m.state));
function syncControls() {
  const a = active(), forcing = a?.stop_requested_at && Date.now() - Date.parse(a.stop_requested_at) > 60000;
  $("stop").hidden = !a || (!!a.stop_requested_at && !forcing);
  $("stop").title = forcing ? "Hentikan paksa" : "Hentikan";
  $("send").disabled = !text.value.trim();
}

// ---------- aliran live (NDJSON) ----------
function stopStream() { streamCtl?.abort(); streamCtl = null; }
async function startStream() {
  stopStream(); const ctl = streamCtl = new AbortController(), sid = session.id;
  try {
    const r = await fetch(`/api/chat/${encodeURIComponent(botId)}/stream?session=${sid}&after=${lastLog}`, { headers: H(), signal: ctl.signal });
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) onEvent(JSON.parse(line)); }
    }
  } catch { if (ctl.signal.aborted) return; }
  if (streamCtl === ctl && session?.id === sid) setTimeout(() => streamCtl === ctl && startStream(), 1000);   // sambung ulang
}
function onEvent(ev) {
  if (ev.t === "log") {
    const m = msgs.get(ev.task_id); if (!m || (m.logs ||= []).some((l) => l.id === ev.log.id)) return;
    m.logs.push(ev.log); lastLog = Math.max(lastLog, ev.log.id);
    const card = $("log").querySelector(`[data-act="${ev.task_id}"]`);
    if (card && OPEN.has(m.state)) {                              // perbarui di tempat: baris "sekarang", jumlah langkah, isi log
      const near = nearBottom(), sum = card.querySelector("summary");
      sum.querySelector(".now").innerHTML = nowLine(m); sum.children[2].textContent = `${visibleLogs(m).length} langkah`;
      const st = card.querySelector(".steps"); st.insertAdjacentHTML("beforeend", stepHtml(ev.log)); st.scrollTop = st.scrollHeight;
      if (near) toBottom();
    } else renderMsg(ev.task_id);
  } else if (ev.t === "msg") {
    const old = msgs.get(ev.msg.id); msgs.set(ev.msg.id, { ...ev.msg, logs: old?.logs || [] });
    if (!old) renderAll(); else renderMsg(ev.msg.id);
    if (!OPEN.has(ev.msg.state) || !old) { refreshApprovals(); refreshSessions(); }
  } else if (ev.t === "bot") {
    if (bots[botId]) Object.assign(bots[botId], { effective_status: ev.bot.status, step: ev.bot.step });
    paintHead(); paintRail(); if (ev.bot.status === "waiting_user") refreshApprovals();
  }
}
async function refreshSessions() {
  const d = await (await api(`/api/chat/${encodeURIComponent(botId)}?session=${session?.id ?? ""}`)).json(); if (d.sessions) paintSessions(d.sessions);
}
async function refreshApprovals() {
  const s = await (await api("/api/state")).json(); approvals = s.approvals || []; bots = s.bots; paintHead(); paintRail();
  const ids = new Set(approvals.map((a) => Number(a.detail?.task)));
  for (const m of msgs.values()) if (ids.has(m.id) || OPEN.has(m.state)) renderMsg(m.id);
}

// ---------- kirim, stop, percakapan baru ----------
const text = $("text");
const grow = () => { text.style.height = "auto"; text.style.height = Math.min(220, text.scrollHeight) + "px"; syncControls(); };
text.addEventListener("input", grow);
text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); } });
$("composer").onsubmit = async (e) => {
  e.preventDefault(); const v = text.value.trim(); if (!v || !botId) return;
  $("send").disabled = true;
  try {
    const r = await api(`/api/chat/${encodeURIComponent(botId)}/send${session ? `?session=${session.id}` : "?new=1"}`, { method: "POST", body: JSON.stringify({ text: v }) });
    const j = await r.json(); if (!r.ok) { alert(j.error || "Gagal mengirim"); return; }
    text.value = ""; grow();
    if (!session || session.id !== j.session) await selectBot(botId, j.session);
    else { msgs.set(j.task_id, { id: j.task_id, instruction: v, state: "queued", created_at: new Date().toISOString(), logs: [] }); renderAll(); }
  } finally { syncControls(); text.focus(); }
};
$("stop").onclick = async () => {
  const a = active(); if (!a || !confirm("Hentikan pekerjaan agent sekarang? Langkah yang sudah terjadi tidak dibatalkan.")) return;
  const r = await api(`/api/tasks/${a.id}/stop`, { method: "POST" }); const j = await r.json().catch(() => ({}));
  if (!r.ok) alert(j.error || "Gagal menghentikan");
  a.stop_requested_at ||= new Date().toISOString(); renderMsg(a.id);
};
$("new").onclick = () => {                                         // percakapan baru dibuat saat pesan pertama dikirim
  stopStream(); session = null; msgs.clear(); opened.clear(); closeMenu();
  history.replaceState(null, "", `?bot=${encodeURIComponent(botId)}`);
  paintSessions(sessionsCache); paintHead(); renderAll(); text.focus();
};
const closeMenu = () => document.body.classList.remove("menu");
$("menu").onclick = () => document.body.classList.toggle("menu");
$("scrim").onclick = closeMenu;
setInterval(() => { if (botId && !document.hidden) loadBots().catch(() => {}); syncControls(); }, 15000);

async function boot() {
  if (!token) return askLogin();
  try { await loadBots(); } catch { return; }
  await selectBot(Q.get("bot"), Number(Q.get("session")) || null);
}
boot();
