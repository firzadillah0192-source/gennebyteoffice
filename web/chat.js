// Chat langsung ke agent: banyak percakapan per agent, jawaban & langkah agent mengalir live (NDJSON), Stop, dan persetujuan di tempat.
import { md, esc } from "./md.js";

const $ = (id) => document.getElementById(id);
const store = { get: () => { try { return localStorage.getItem("office.token"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("office.token", v); } catch {} } };
let token = store.get();
const H = () => ({ Authorization: `Bearer ${token}` });
const api = async (path, opt = {}) => { const r = await fetch(path, { ...opt, headers: { ...H(), ...(opt.headers || {}) } });
  if (r.status === 401) { askLogin(); throw new Error("butuh login"); } return r; };
const hm = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const STATE = { queued: "antre", running: "bekerja", done: "selesai", failed: "gagal", cancelled: "dibatalkan", stopped: "dihentikan" };
const OPEN = new Set(["queued", "running"]);
const Q = new URLSearchParams(location.search);

// Markdown + blok kode ```...```
function mdx(src) {
  return String(src ?? "").split(/```[^\n]*\n?/).map((part, i) => i % 2 ? `<pre>${esc(part.replace(/\n$/, ""))}</pre>` : md(part)).join("");
}

let bots = {}, botId = null, session = null, msgs = new Map(), approvals = [], streamCtl = null, lastLog = 0;

function askLogin() { $("login").hidden = false; $("token").focus(); }
$("login-form").onsubmit = async (e) => {
  e.preventDefault(); token = $("token").value.trim();
  const r = await fetch("/api/state", { headers: H() });
  if (!r.ok) { $("login-err").textContent = "Token salah."; return; }
  store.set(token); $("login").hidden = true; boot();
};

async function loadBots() {
  const s = await (await api("/api/state")).json();
  bots = s.bots; approvals = s.approvals || [];
  const list = Object.values(bots).filter((b) => b.id !== "clipper-bot")
    .sort((a, b) => (b.id.startsWith("operator") - a.id.startsWith("operator")) || a.name.localeCompare(b.name));
  const sel = $("bot"), cur = sel.value;
  sel.innerHTML = list.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}${b.remote ? " · di VM-nya" : ""}</option>`).join("");
  sel.value = cur || botId || Q.get("bot") || list[0]?.id;
  paintBot();
}
const online = (b) => !b.remote || (b.seen_ms != null && b.seen_ms < 120000);
function paintBot() {
  const b = bots[botId]; if (!b) return;
  const st = online(b) ? b.effective_status : "offline";
  $("bot-info").innerHTML = `<i class="dot ${esc(st)}"></i>${esc(online(b) ? (b.step || st) : "Worker di VM-nya belum terhubung")}<br>${esc(b.role)}`;
  $("title").textContent = session?.title || b.name;
  $("sub").innerHTML = `<i class="dot ${esc(st)}"></i>${esc(b.name)} · ${online(b) ? esc({ working: "sedang bekerja", idle: "siap", waiting_user: "menunggu persetujuanmu", error: "ada kendala", done: "selesai" }[b.effective_status] || b.effective_status) : "offline"}`;
}

async function selectBot(id, sessionId) {
  botId = id; $("bot").value = id; session = null; msgs.clear(); lastLog = 0;
  history.replaceState(null, "", `?bot=${encodeURIComponent(id)}${sessionId ? `&session=${sessionId}` : ""}`);
  await loadChat(sessionId);
}
async function loadChat(sessionId) {
  stopStream();
  const d = await (await api(`/api/chat/${encodeURIComponent(botId)}${sessionId ? `?session=${sessionId}` : ""}`)).json();
  if (d.error) { $("log").innerHTML = `<p class="hint">${esc(d.error)}</p>`; return; }
  session = d.session; msgs.clear();
  for (const m of d.messages) msgs.set(m.id, m);
  lastLog = d.last_log || 0;
  paintSessions(d.sessions); paintBot(); renderAll();
  if (session) startStream();
}
function paintSessions(list) {
  const nav = $("sessions");
  nav.innerHTML = list.length ? list.map((s) => `<div class="s ${session?.id === s.id ? "on" : ""}" data-id="${s.id}">
      ${s.busy ? `<i class="dot working"></i>` : ""}<span>${esc(s.title || "Percakapan baru")}</span><small>${esc(hm(s.last_at))}</small>
      <button class="x" data-close="${s.id}" title="Sembunyikan percakapan">✕</button></div>`).join("")
    : `<div class="empty">Belum ada percakapan.</div>`;
  nav.querySelectorAll(".s").forEach((el) => el.onclick = (e) => {
    if (e.target.dataset.close) return; document.body.classList.remove("menu"); selectBot(botId, Number(el.dataset.id));
  });
  nav.querySelectorAll("[data-close]").forEach((b) => b.onclick = async () => {
    if (!confirm("Sembunyikan percakapan ini dari daftar?")) return;
    await api(`/api/chat/${encodeURIComponent(botId)}/close?session=${b.dataset.close}`, { method: "POST" });
    selectBot(botId, session?.id === Number(b.dataset.close) ? null : session?.id);
  });
}

// ---------- tampilan pesan ----------
function msgHtml(m) {
  const logs = m.logs || [], open = OPEN.has(m.state);
  const term = logs.length ? `<div class="term">${logs.map((l) => `<div class="${esc(l.kind)}">${esc(l.text)}</div>`).join("")}</div>` : "";
  const ap = approvals.find((a) => Number(a.detail?.task) === m.id);
  return `<div class="u">${esc(m.instruction)}</div>
    <div class="a" data-msg="${m.id}">
      <div class="who"><b>${esc(bots[botId]?.name || "Agent")}</b><span class="badge ${esc(m.state)}">${esc(STATE[m.state] || m.state)}</span>${esc(hm(m.created_at))}${m.stop_requested_at && open ? " · menghentikan…" : ""}</div>
      ${open ? term : logs.length ? `<details class="steps"><summary>${logs.length} langkah</summary>${term}</details>` : ""}
      ${ap ? `<div class="approve"><b>Minta persetujuan:</b> ${esc(ap.action)}<pre>${esc(ap.detail?.plan || "")}</pre>
        <div class="row"><button class="primary" data-ap="${ap.id}" data-do="approve">Setujui & jalankan</button><button data-ap="${ap.id}" data-do="reject">Tolak</button></div></div>` : ""}
      ${m.result ? `<div class="out ${esc(m.state)}">${mdx(m.result)}</div>` : open ? `<div class="typing">${m.state === "queued" ? "Menunggu giliran agent" : "Agent sedang bekerja"}<i>…</i></div>` : ""}
    </div>`;
}
function renderAll() {
  const log = $("log");
  if (!session || !msgs.size) {
    const b = bots[botId];
    log.innerHTML = `<div class="hint"><b>${esc(b?.name || "")}</b><br>${esc(b?.role || "")}<br><br>Ketik perintah di bawah. Agent menjawab di sini secara live, dan percakapan ini diingat sampai kamu memulai percakapan baru.</div>`;
  } else log.innerHTML = [...msgs.values()].map(msgHtml).join("");
  wire(); toBottom(true); syncStop();
}
function renderMsg(id) {
  const m = msgs.get(id); if (!m) return;
  const el = $("log").querySelector(`[data-msg="${id}"]`);
  if (!el) return renderAll();
  const near = nearBottom(), term = el.querySelector(".term"), keep = term ? term.scrollTop : 0;
  const tmp = document.createElement("div"); tmp.innerHTML = msgHtml(m);
  el.replaceWith(tmp.querySelector(".a"));
  const nt = $("log").querySelector(`[data-msg="${id}"] .term`); if (nt) nt.scrollTop = OPEN.has(m.state) ? nt.scrollHeight : keep;
  wire(); if (near) toBottom(); syncStop();
}
function wire() {
  $("log").querySelectorAll("[data-ap]").forEach((b) => b.onclick = async () => {
    b.disabled = true; await api(`/api/approval/${b.dataset.ap}/${b.dataset.do}`, { method: "POST" });
    approvals = approvals.filter((a) => String(a.id) !== b.dataset.ap); renderAll();
  });
}
const nearBottom = () => { const l = $("log"); return l.scrollTop + l.clientHeight >= l.scrollHeight - 80; };
const toBottom = () => { const l = $("log"); l.scrollTop = l.scrollHeight; };
const active = () => [...msgs.values()].reverse().find((m) => OPEN.has(m.state));
function syncStop() { const a = active(); $("stop").hidden = !a; $("stop").disabled = !!a?.stop_requested_at && Date.now() - Date.parse(a.stop_requested_at) < 60000; $("stop").textContent = a?.stop_requested_at ? "Stop paksa" : "Stop"; }

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
  } catch (e) { if (ctl.signal.aborted) return; }
  if (streamCtl === ctl && session?.id === sid) setTimeout(() => streamCtl === ctl && startStream(), 1000);   // sambung ulang
}
function onEvent(ev) {
  if (ev.t === "log") {
    const m = msgs.get(ev.task_id); if (!m || (m.logs ||= []).some((l) => l.id === ev.log.id)) return;
    m.logs.push(ev.log); lastLog = Math.max(lastLog, ev.log.id);
    const term = $("log").querySelector(`[data-msg="${ev.task_id}"] .term`);
    if (term && OPEN.has(m.state)) { const near = nearBottom(); term.insertAdjacentHTML("beforeend", `<div class="${esc(ev.log.kind)}">${esc(ev.log.text)}</div>`); term.scrollTop = term.scrollHeight; if (near) toBottom(); }
    else renderMsg(ev.task_id);
  } else if (ev.t === "msg") {
    const old = msgs.get(ev.msg.id); msgs.set(ev.msg.id, { ...ev.msg, logs: old?.logs || [] });
    if (!old) renderAll(); else renderMsg(ev.msg.id);
    if (!OPEN.has(ev.msg.state) || !old) { refreshApprovals(); refreshSessions(); }
  } else if (ev.t === "bot") { if (bots[botId]) Object.assign(bots[botId], { effective_status: ev.bot.status, step: ev.bot.step }); paintBot(); if (ev.bot.status === "waiting_user") refreshApprovals(); }
}
async function refreshSessions() {
  const d = await (await api(`/api/chat/${encodeURIComponent(botId)}?session=${session?.id ?? ""}`)).json(); if (d.sessions) paintSessions(d.sessions);
}
async function refreshApprovals() {
  const s = await (await api("/api/state")).json(); approvals = s.approvals || []; bots = s.bots; paintBot();
  const ids = new Set(approvals.map((a) => Number(a.detail?.task)));
  for (const m of msgs.values()) if (ids.has(m.id) || OPEN.has(m.state)) renderMsg(m.id);
}

// ---------- kirim, stop, percakapan baru ----------
const text = $("text");
text.addEventListener("input", () => { text.style.height = "auto"; text.style.height = Math.min(200, text.scrollHeight) + "px"; });
text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); } });
$("composer").onsubmit = async (e) => {
  e.preventDefault(); const v = text.value.trim(); if (!v || !botId) return;
  $("send").disabled = true;
  try {
    const r = await api(`/api/chat/${encodeURIComponent(botId)}/send${session ? `?session=${session.id}` : ""}`, { method: "POST", body: JSON.stringify({ text: v }) });
    const j = await r.json(); if (!r.ok) { alert(j.error || "Gagal mengirim"); return; }
    text.value = ""; text.style.height = "auto";
    if (!session || session.id !== j.session) await selectBot(botId, j.session);
    else msgs.set(j.task_id, { id: j.task_id, instruction: v, state: "queued", created_at: new Date().toISOString(), logs: [] }), renderAll();
  } finally { $("send").disabled = false; text.focus(); }
};
$("stop").onclick = async () => {
  const a = active(); if (!a || !confirm("Hentikan pekerjaan agent sekarang? Langkah yang sudah terjadi tidak dibatalkan.")) return;
  const r = await api(`/api/tasks/${a.id}/stop`, { method: "POST" }); const j = await r.json().catch(() => ({}));
  if (!r.ok) alert(j.error || "Gagal menghentikan");
  a.stop_requested_at ||= new Date().toISOString(); renderMsg(a.id);
};
$("new").onclick = async () => {
  if (!botId) return; const r = await api(`/api/chat/${encodeURIComponent(botId)}/new`, { method: "POST" }); const j = await r.json();
  document.body.classList.remove("menu"); await selectBot(botId, j.session); text.focus();
};
$("bot").onchange = () => selectBot($("bot").value);
$("menu").onclick = () => document.body.classList.toggle("menu");
setInterval(() => { if (botId && !document.hidden) loadBots().catch(() => {}); syncStop(); }, 15000);

async function boot() {
  if (!token) return askLogin();
  try { await loadBots(); } catch { return; }
  await selectBot($("bot").value, Number(Q.get("session")) || null);
}
boot();
