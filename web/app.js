import * as THREE from "three";
import { LAYOUT, BUILDING, buildRoom, labelSprite, shortRole } from "./rooms.js";
import { buildSurroundings } from "./garden.js";
import { Bot } from "./bots.js";
import { Board } from "./board.js";
import { md, plain } from "./md.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get: () => { try { return localStorage.getItem("office.token"); } catch { return null; } },
  set: (v) => { try { v ? localStorage.setItem("office.token", v) : localStorage.removeItem("office.token"); } catch {} } };

// ---------- adegan ----------
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfe0f2);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const Q = new URLSearchParams(location.search);
function gpuName() { try { const c = document.createElement("canvas"), g = c.getContext("webgl"), e = g && g.getExtension("WEBGL_debug_renderer_info"), n = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ""; g && g.getExtension("WEBGL_lose_context")?.loseContext(); return n; } catch { return ""; } }
const GPU = gpuName(), SAFE = !Q.has("hq") && (Q.has("safe") || /intel/i.test(GPU));   // profil aman (tanpa antialias & bayangan, resolusi 1x) otomatis untuk GPU Intel; ?hq memaksa kualitas penuh                                  // sakelar diagnosis grafis: ?nosh (tanpa bayangan) ?noaa (tanpa antialias) ?px1 (resolusi 1x)
if (Q.has("plain")) document.documentElement.classList.add("plain");
const renderer = new THREE.WebGLRenderer({ antialias: !SAFE && !Q.has("noaa"), powerPreference: "high-performance" });
renderer.setPixelRatio(Q.has("px1") ? 1 : Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = !SAFE && !Q.has("nosh"); renderer.shadowMap.type = THREE.PCFShadowMap;
$("scene").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-18, 40, 22); sun.castShadow = !SAFE && !Q.has("nosh");
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 36, bottom: -36, near: 1, far: 140 });
scene.add(sun);
scene.add(buildSurroundings(BUILDING));

const roomGroups = {}, floors = [], boards = {}, boardMeshes = [], labelSprites = [];
for (const id of Object.keys(LAYOUT)) {
  const g = buildRoom(id); scene.add(g); roomGroups[id] = g;
  g.traverse((o) => { if (o.userData.roomId && o.isMesh) floors.push(o); });
  if (!LAYOUT[id].decor) {                                   // papan tulis berdiri di sudut depan-kiri ruangan
    const L0 = LAYOUT[id], bd = new Board(id, L0.label);
    bd.group.position.set(id === "lobby" ? -18 : L0.x - 3.5, 0, id === "lobby" ? -3.2 : L0.z + 2.9);
    scene.add(bd.group); boards[id] = bd; bd.group.traverse((o) => o.isMesh && boardMeshes.push(o));
  }
  const L = LAYOUT[id], tag = labelSprite(L.label, { size: 56, scale: 0.016 }); tag.position.set(L.x, id === "lobby" ? 3.6 : L.wallH + 1.0, id === "lobby" ? L.z - 3.6 : L.z - L.d / 2 + 0.4); tag.userData.room = id; scene.add(tag); labelSprites.push(tag);
}

// kamera: tampak seluruh lantai atau fokus ke satu ruangan
const VIEW_ALL = { pos: new THREE.Vector3(0, 46, 40), look: new THREE.Vector3(2, 0, 4), fitW: 58 };
let view = { pos: VIEW_ALL.pos.clone(), look: VIEW_ALL.look.clone(), fitW: VIEW_ALL.fitW }, zoomK = 1, focusedRoom = null;
const curLook = view.look.clone();
function focusRoom(id) {
  focusedRoom = id;
  if (!id) { view = { pos: VIEW_ALL.pos.clone(), look: VIEW_ALL.look.clone(), fitW: VIEW_ALL.fitW }; markRooms(); $("btn-lobby").hidden = true; $("btn-board").hidden = true; closeBoard(); $("room-title").textContent = ""; return; }
  const L = LAYOUT[id]; view = id === "lobby" ? { pos: new THREE.Vector3(0, 24, 22), look: new THREE.Vector3(0, 0.5, 2), fitW: 36 } : { pos: new THREE.Vector3(L.x, 11, L.z + 11), look: new THREE.Vector3(L.x, 0.5, L.z), fitW: 17 }; markRooms();
  $("btn-lobby").hidden = false; $("btn-board").hidden = !boards[id]; $("room-title").textContent = L.label;
}
$("btn-lobby").onclick = () => { focusRoom(null); select(null); };
addEventListener("wheel", (e) => { zoomK = Math.min(1.5, Math.max(0.5, zoomK + Math.sign(e.deltaY) * 0.06)); }, { passive: true });
let lastSheetPx = 0;                                       // harus dideklarasikan sebelum resize() pertama dipanggil
let pixelScale = SAFE || Q.has("px1") ? 1 : Math.min(devicePixelRatio, 2);                           // skala resolusi gambar (diturunkan otomatis bila lambat)
function resize() { const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(Math.max(1, Math.round(w * pixelScale)), Math.max(1, Math.round(h * pixelScale)), false);   // buffer = bilangan bulat piksel perangkat; gaya CSS 100% (tanpa pembulatan pecahan 1,25)
  renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = w / h; lastSheetPx = -1; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// Panel yang tidak berubah isinya tidak ditulis ulang ke DOM (mengurangi gambar-ulang di atas kanvas 3D).
function dedupeHtml(el) { const d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML"); Object.defineProperty(el, "innerHTML", { get() { return d.get.call(this); }, set(v) { if (this._h === v) return; this._h = v; d.set.call(this, v); } }); }
["feed", "roster", "roomlist", "island", "approvals"].forEach((id) => dedupeHtml($(id)));

// ---------- data & karyawan ----------
let state = null, selected = null, bots = new Map(), token = store.get(), lastVersion = -1;
function setHTML(el, html) { if (el.__h === html) return false; el.__h = html; el.innerHTML = html; return true; }   // tulis ulang hanya bila isinya berubah (mengurangi gambar-ulang di atas kanvas)
function setConn(t, ok) { const c = $("conn"); setText(c, t); if (c.dataset.ok !== ok) c.dataset.ok = ok; }
function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
const guest = !token;                                     // tanpa token = mode tamu (hanya lihat, data tersaring server)
const headers = () => ({ Authorization: `Bearer ${token}` });

function syncBoards() { for (const [id, b] of Object.entries(boards)) b.update(state.board?.[id] ?? []); }
// Bot remote dianggap offline bila tak ada kontak ke Office > 3 menit (umur dihitung lokal dari denyut terakhir).
function refreshOffline(quiet) {
  if (!state) return;
  for (const b of Object.values(state.bots)) {
    if (!b.remote) continue;
    const age = b.seen_ms == null ? Infinity : Number(b.seen_ms) + (Date.now() - (b.seen_at || Date.now())), off = age > 180000;
    if (b.offline !== off) { b.offline = off; if (!quiet) { bots.get(b.id)?.setData(b); if (selected === b.id) renderPanel(); } }
  }
}
function syncBots() {
  syncBoards();
  for (const d of Object.values(state.bots)) {
    let b = bots.get(d.id);
    if (!b) { b = new Bot(d); bots.set(d.id, b); scene.add(b.root); }
    b.data.room !== d.room && (b.data = d);
    b.setData(d);
  }
}

async function poll() {
  try {
    const res = await fetch(`${guest ? "/api/public/state" : "/api/state"}?since=${lastVersion}`, { headers: guest ? {} : headers(), cache: "no-store" });
    if (!guest && res.status === 401) { logout(); return; }
    if (guest && res.status === 403) { $("login").hidden = false; $("login-cancel").hidden = true; $("login-err").textContent = "Mode tamu dimatikan; silakan masuk."; return; }
    if (res.status === 429) { setConn("terlalu sering…", "0"); return; }
    if (!res.ok) { setConn("server " + res.status, "0"); return; }
    const s = await res.json(); setConn(guest ? "mode tamu ●" : "terhubung ●", "1");
    if (s.unchanged) { if (state && s.seen) for (const [id, ms] of Object.entries(s.seen)) if (state.bots[id]) { state.bots[id].seen_ms = ms; state.bots[id].seen_at = Date.now(); } refreshOffline(); return; }
    for (const b of Object.values(s.bots)) if (b.remote) b.seen_at = Date.now();
    state = s; lastVersion = s.version; refreshOffline(true); syncBots(); renderUI();
  } catch { setConn("terputus…", "0"); }
}
setInterval(poll, 1500);

// ---------- UI ----------
function renderIsland() {
  const list = Object.values(state.bots), n = (st) => list.filter((b) => b.effective_status === st && !b.offline).length, t = state.tasks24h || {};
  const waiting = (guest ? (state.approvals_count || 0) : state.approvals.length) + n("waiting_user"), err = n("error"), working = n("working");
  const resting = list.filter((b) => !b.offline && !["working", "waiting_user", "error"].includes(b.effective_status)).length;
  const it = (cls, num, label, short) => `<span class="it ${cls}${num ? " on" : ""}"><i></i><b>${num}</b> <span class="lg">${label}</span><span class="sm">${short}</span></span>`;
  const el = $("island"); el.hidden = false; el.classList.toggle("alert", err > 0);
  el.title = "Status karyawan saat ini. 'Selesai' = tugas yang rampung dalam 24 jam terakhir.";
  setHTML(el, it("run", working, "bekerja", "kerja") + it("wait", waiting, "menunggu", "tunggu") + it("bad", err, "error", "err") + it("rest", resting, "istirahat", "rehat") + it("ok", t.done || 0, "selesai", "selesai"));
}
// ---- jam "Live" dan tombol kendali otomatis ----
const tick = () => { setText($("live"), "● Live " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")); };
tick(); setInterval(tick, 15000);
function renderAuto() {
  const b = $("btn-auto"), au = state.auto; if (guest || !au) return;
  const small = innerWidth <= 760; setText(b, au.paused ? (small ? "Auto: JEDA" : "Otomatis: DIJEDA") : (small ? `Auto ${au.used_today}/${au.daily_max}` : `Otomatis aktif · ${au.used_today}/${au.daily_max}`)); b.classList.toggle("warn", !!au.paused);
  b.title = "Rutinitas berjadwal para karyawan. Klik untuk " + (au.paused ? "melanjutkan" : "menjeda semuanya") + `. Terpakai ${au.used_today} dari batas ${au.daily_max} tugas otomatis hari ini.`;
}
$("btn-auto").onclick = async () => { const au = state?.auto; if (!au) return; await fetch("/api/auto", { method: "POST", headers: headers(), body: JSON.stringify({ paused: !au.paused }) }); lastVersion = -1; poll(); };
// ---- daftar ruangan (kiri) dan karyawan (kanan), seperti acuan ----
const STD = { working: "bekerja", idle: "istirahat", waiting_user: "menunggu Anda", error: "error", done: "selesai" };
function pickBot(id) { const b = state.bots[id]; if (!b) return; if (b.room !== focusedRoom) focusRoom(b.room); select(id); }
function renderRoomList() {
  if (!state) return; const el = $("roomlist");
  const rows = Object.entries(LAYOUT).filter(([, L]) => !L.decor).map(([id, L]) => { const inRoom = Object.values(state.bots).filter((b) => b.room === id);
    return `<button class="rl${focusedRoom === id ? " on" : ""}" data-room="${id}"><b>${esc(L.label)}</b><span class="dots">${inRoom.map((b) => `<i class="s-${esc(b.offline ? "idle" : b.effective_status)}"></i>`).join("")}</span><em>${inRoom.length || ""}</em></button>`; }).join("");
  if (setHTML(el, `<div class="rh"><span>Ruangan</span><button class="rl${focusedRoom ? "" : " on"}" data-room="">Semua</button></div>${rows}`)) el.querySelectorAll("[data-room]").forEach((b) => b.onclick = () => { select(null); focusRoom(b.dataset.room || null); });
}
function renderRoster() {
  if (!state) return; const el = $("roster");
  const list = Object.values(state.bots).filter((b) => !focusedRoom || b.room === focusedRoom).sort((a, b) => (a.effective_status === "waiting_user" ? -1 : 0) - (b.effective_status === "waiting_user" ? -1 : 0) || a.name.localeCompare(b.name));
  const html = `<div class="rh"><span>${esc(focusedRoom ? LAYOUT[focusedRoom].label : "Semua karyawan")}</span><em>${list.length}</em></div>` + (list.map((b) => {
    const st = b.offline ? "offline" : b.effective_status, act = b.offline ? "worker belum terhubung" : plain(b.step) || STD[st] || "";
    return `<div class="rrow ${b.id === selected ? "on" : ""}" data-bot="${esc(b.id)}"><i class="av" style="background:${esc(b.look?.color || "#4c9bff")}"></i><div class="rt"><b>${esc(b.name)}</b><small>${esc(shortRole(b.role))}</small><span>${esc(act)}</span></div><i class="sd s-${esc(st)}" title="${esc(STD[st] || st)}"></i></div>`; }).join("") || "<small>Belum ada karyawan.</small>");
  if (!setHTML(el, html)) return;
  el.querySelectorAll("[data-bot]").forEach((r) => r.onclick = () => pickBot(r.dataset.bot));
}
function renderUI() {
  renderIsland(); renderAuto(); renderRoster(); renderRoomList();
  setHTML($("feed"), state.events.slice(0, 6).map((e) =>
    `<div><span class="dot s-${esc(e.status)}"></span><b>${esc(e.bot)}</b> ${esc(plain(e.step))}</div>`).join("") || "<div>Belum ada aktivitas.</div>");
  const ap = $("approvals"), apList = guest ? [] : state.approvals; ap.hidden = !apList.length;
  const apHtml = `<h3>Menunggu keputusan Anda (${apList.length})</h3>` + apList.map((a) =>
    `<div class="appr"><b>${esc(state.bots[a.bot_id]?.name)}</b>: ${esc(a.action)}${a.detail && a.detail.plan ? `<pre class="plan">${esc(a.detail.plan)}</pre>` : `<br><small>${esc(JSON.stringify(a.detail))}</small>`}
     <div class="row"><button class="primary" data-ok="${a.id}">Setujui</button><button class="danger" data-no="${a.id}">Tolak</button></div></div>`).join("");
  if (setHTML(ap, apHtml)) ap.querySelectorAll("[data-ok],[data-no]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.ok || b.dataset.no, act = b.dataset.ok ? "approve" : "reject";
    await fetch(`/api/approval/${id}/${act}`, { method: "POST", headers: headers() }); lastVersion = -1; poll();
  });
  renderPanel(); refreshBoard(); if (!guest && !$("ledger").hidden) openLedger();
}

// ---- kartu karyawan bergaya acuan: header berwarna, status+durasi, langkah sekarang, statistik, riwayat ----
const dur = (iso) => { if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt` : m < 2880 ? `${Math.round(m / 60)} jam` : `${Math.round(m / 1440)} hari`; };
const STLABEL = { working: "Bekerja", idle: "Istirahat", waiting_user: "Menunggu Anda", error: "Error", done: "Selesai", offline: "Offline" };
let statsAt = 0, statsFor = null, statsData = null;
async function loadStats(botId, force) {
  if (!force && statsFor === botId && Date.now() - statsAt < 4000) return;
  statsAt = Date.now(); statsFor = botId;
  const r = await fetch(guest ? `/api/public/bot?id=${encodeURIComponent(botId)}` : `/api/bots/${encodeURIComponent(botId)}/stats`, { headers: guest ? {} : headers() }).catch(() => null);
  if (!r || !r.ok || selected !== botId) return; statsData = await r.json(); paintStats();
}
function updateChip() {
  const b = state?.bots[selected]; if (!b || !$("p-status")) return; const st = b.offline ? "offline" : b.effective_status, since = statsData?.since;
  setHTML($("p-status"), `<i class="dot s-${esc(st)}"></i>${esc(STLABEL[st] || st)}${since && !b.offline ? ` · ${esc(dur(since))}` : ""}`);
  setText($("p-step"), b.offline ? "Worker di VM-nya belum terhubung ke Office." : (plain(b.step) || ""));
}
function paintStats() {
  const st = statsData; if (!st || !$("p-stats")) return; const hrs = st.worked_sec / 3600;
  setHTML($("p-stats"), `<div><b>${st.steps}</b><small>langkah</small></div><div><b>${st.tasks.done}<i>/${st.tasks.total}</i></b><small>tugas selesai</small></div><div><b>${hrs < 10 ? hrs.toFixed(1) : Math.round(hrs)}</b><small>jam kerja</small></div>`);
  setHTML($("p-share"), `<div class="lab"><span>Porsi tugas (${st.days} hari)</span><b>${st.share_pct}%</b></div><div class="bar"><i style="width:${Math.max(2, st.share_pct)}%"></i></div>`);
  setHTML($("p-recent"), st.recent.map((r) => `<div><time>${new Date(r.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time><span>${esc(plain(r.step))}</span></div>`).join("") || "<small>Belum ada langkah.</small>");
  updateChip();
}
setInterval(() => selected && loadStats(selected), 8000);

async function renderPanel() {
  const p = $("panel"), b = selected && state?.bots[selected];
  if (!b) { p.hidden = true; document.body.classList.remove("panel-open"); return; }
  p.hidden = false; document.body.classList.add("panel-open");
  if (p.dataset.bot !== b.id) {                                   // kartu dibangun ulang hanya saat ganti bot
    p.dataset.bot = b.id; statsData = null; statsFor = null;
    const off = guest ? "disabled" : "", color = b.look?.color || "#4c9bff";
    p.innerHTML = `<div class="phead" style="--c:${esc(color)}"><i class="av"></i><div class="ht"><h2></h2><small class="hr"></small></div>${guest ? "" : `<button id="p-cfg" class="x" title="Instruksi tetap & rutinitas">Atur</button>`}<button id="p-close" class="x" title="Tutup">✕</button></div>
      <div id="p-status" class="chip"></div><div id="p-step" class="pstep"></div>
      <div id="p-stats" class="pstats"></div><div id="p-share" class="pshare"></div>
      <div class="prow"><input id="p-task" ${off} autocomplete="off" placeholder="${guest ? "Mode tamu — hanya lihat" : `Beri tugas untuk ${esc(b.name)}…`}"><button class="primary" id="p-send" ${off}>Kirim</button></div>
      ${guest ? `<small class="guest-note">Masuk sebagai admin untuk memberi tugas.</small>` : ""}
      <div class="sec">Langkah terbaru</div><div id="p-recent" class="precent"></div>
      ${guest ? "" : `<div class="sec">Tugas terbaru</div><div id="p-tasks"></div>`}`;
    $("p-task").addEventListener("keydown", (e) => { if (e.key === "Enter") $("p-send").click(); });
    p.querySelector("h2").textContent = b.name; p.querySelector(".hr").textContent = `${shortRole(b.role)} · ${LAYOUT[b.room]?.label ?? b.room}`;
    $("p-close").onclick = () => select(null);
    if (!guest) $("p-cfg").onclick = () => openCfg(b.id);
    if (!guest) $("p-send").onclick = async () => {
      const v = $("p-task").value.trim(); if (!v) return;
      const r = await fetch("/api/tasks", { method: "POST", headers: headers(), body: JSON.stringify({ bot: b.id, instruction: v }) });
      $("p-task").value = ""; if (r.ok) { lastVersion = -1; poll(); loadTasks(b.id); }
    };
    loadStats(b.id, true); if (!guest) loadTasks(b.id);
  } else loadStats(b.id);
  updateChip();
}
async function loadTasks(botId) {
  if (guest) return;
  const r = await fetch("/api/tasks", { headers: headers() }); if (!r.ok) return;
  const list = (await r.json()).tasks.filter((t) => t.bot_id === botId).slice(0, 3);
  const el = $("p-tasks"); if (!el) return;
  const th = list.map((t) => `<div class="task"><b>${esc(t.state)}</b> · ${esc(plain(t.instruction))}${t.result ? `<div class="md">${md(t.result)}</div>` : ""}${t.state === "queued" ? ` <button class="cancel" data-cancel="${t.id}">Batalkan</button>` : ""}</div>`).join("");
  if (setHTML(el, th)) el.querySelectorAll("[data-cancel]").forEach((c) => c.onclick = () => cancelTask(c.dataset.cancel));
}
setInterval(() => selected && loadTasks(selected), 5000);

async function cancelTask(id) {                                   // hanya admin: tombol tidak dibuat untuk tamu & server menolak tanpa token
  if (guest || !confirm(`Batalkan tugas #${id}?`)) return;
  const r = await fetch(`/api/tasks/${id}/cancel`, { method: "POST", headers: headers() });
  if (!r.ok) alert((await r.json().catch(() => ({}))).error || "Gagal membatalkan");
  lastVersion = -1; poll(); refreshBoard(); if (selected) loadTasks(selected);
}
function select(id) { selected = id; $("panel").dataset.bot = ""; renderPanel(); renderRoster(); }

// ---------- papan tugas (hasil kerja, disimpan beberapa hari) ----------
let boardRoom = null;
const dayName = (iso) => { const d = new Date(iso), n = new Date(), y = new Date(Date.now() - 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return same(d, n) ? "Hari ini" : same(d, y) ? "Kemarin" : d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" }); };
const hm = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const syncSheet = () => document.body.classList.toggle("sheet-open", !$("board").hidden || !$("ledger").hidden || !$("cfg").hidden);
function closeBoard() { boardRoom = null; $("board").hidden = true; $("board").dataset.room = ""; syncSheet(); }
$("btn-board").onclick = () => focusedRoom && openBoard(focusedRoom);
async function openBoard(roomId) {
  boardRoom = roomId; const el = $("board"); el.hidden = false; syncSheet();
  if (el.dataset.room !== roomId) {                          // kerangka dibangun sekali per ruangan, daftar di-refresh terus
    el.dataset.room = roomId;
    const botsHere = Object.values(state.bots).filter((b) => roomId === "lobby" || b.room === roomId);
    el.innerHTML = `<div class="hd"><h2>Papan Tugas · ${esc(LAYOUT[roomId].label)}</h2><span></span><button id="b-close">Tutup</button></div>
      <div class="sub" id="b-sub"></div>
      <div class="send">${botsHere.length ? `<select id="b-bot">${botsHere.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} — ${esc(b.role)}</option>`).join("")}</select>
        <textarea id="b-text" placeholder="Tulis instruksi…"></textarea><button class="primary" id="b-send">Beri tugas</button>` : "<small>Belum ada karyawan di ruangan ini.</small>"}</div>
      <div id="b-list"></div>`;
    const form = el.querySelector(".send");
    if (form && !guest) {                                      // admin: formulir dilipat; daftar tugas tampil lebih dulu
      form.classList.add("collapsed");
      form.insertAdjacentHTML("beforebegin", `<button id="b-new" class="primary">+ Beri tugas</button>`);
      $("b-new").onclick = () => { const c = form.classList.toggle("collapsed"); $("b-new").textContent = c ? "+ Beri tugas" : "Sembunyikan formulir"; if (!c) $("b-text").focus(); };
    }
    if (guest) {                                               // tamu: form tetap tampil tapi abu-abu & tidak bisa dipakai
      el.querySelectorAll(".send select, .send textarea, .send button").forEach((x) => { x.disabled = true; });
      const ta = el.querySelector(".send textarea"); if (ta) ta.placeholder = "Mode tamu — hanya lihat";
      el.querySelector(".send")?.insertAdjacentHTML("beforeend", `<small class="guest-note">Mode tamu: hanya bisa melihat. Masuk sebagai admin untuk memberi tugas.</small>`);
    }
    $("b-close").onclick = closeBoard;
    const send = $("b-send");
    if (send) send.onclick = async () => {
      const v = $("b-text").value.trim(); if (!v) return;
      const r = await fetch("/api/tasks", { method: "POST", headers: headers(), body: JSON.stringify({ bot: $("b-bot").value, instruction: v }) });
      if (r.ok) { $("b-text").value = ""; lastVersion = -1; poll(); }
    };
  }
  refreshBoard();
}
async function refreshBoard() {
  if (!boardRoom) return;
  const room = boardRoom, r = await fetch(`${guest ? "/api/public/board" : "/api/board"}?room=${encodeURIComponent(room)}`, { headers: guest ? {} : headers() });
  if (!r.ok || room !== boardRoom) return;
  const d = await r.json(), list = $("b-list"); if (!list) return;
  $("b-sub").textContent = guest ? `Mode tamu: hanya potongan awal teks yang tampil, bagian sensitif disamarkan. Tersimpan ${d.retention_days} hari.`
    : `Instruksi & hasil tersimpan ${d.retention_days} hari, lalu dihapus otomatis. Centang "tamu" untuk menampilkan teks lengkap tugas ke pengunjung.`;
  let day = "", html = "";
  for (const t of d.tasks) {
    const dn = dayName(t.created_at); if (dn !== day) { day = dn; html += `<div class="day">${esc(dn)}</div>`; }
    html += `<div class="item ${esc(t.state)}"><div class="meta"><b>${esc(t.bot)}</b>${t.from_bot ? ` ← dari ${esc(t.from_bot)}` : ""}${t.routine ? ` <span class="badge auto" title="Dijalankan otomatis oleh rutinitas">otomatis · ${esc(t.routine)}</span>` : ""} · ${hm(t.created_at)}<span class="badge ${esc(t.state)}">${esc({ queued: "antre", running: "dikerjakan", done: "selesai", failed: "gagal", cancelled: "dibatalkan" }[t.state] || t.state)}</span>${!guest && t.state === "queued" ? `<button class="cancel" data-cancel="${t.id}">Batalkan</button>` : ""}${guest ? "" : `<label class="pub"><input type="checkbox" data-pub="${t.id}" ${t.is_public ? "checked" : ""}> tampil ke tamu</label>`}</div>
      <div class="md ins">${md(t.instruction)}</div>${t.result ? `<div class="out md">${md(t.result)}</div>` : ""}</div>`;
  }
  if (!setHTML(list, html || "<small>Belum ada tugas dalam 5 hari terakhir.</small>")) return;
  list.querySelectorAll("[data-cancel]").forEach((c) => c.onclick = () => cancelTask(c.dataset.cancel));
  list.querySelectorAll("[data-pub]").forEach((c) => c.onchange = async () => {
    await fetch(`/api/tasks/${c.dataset.pub}/public`, { method: "POST", headers: headers(), body: JSON.stringify({ public: c.checked }) }); lastVersion = -1; poll();
  });
}

// ---------- Pembukuan & cadangan (khusus admin; tamu tidak punya tombol dan server menolak tanpa token) ----------
const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID");
let ledgerMonth = null, ledgerShowVoid = false, ledgerRows = [];
const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const shiftMonth = (m, d) => { const [y, mo] = m.split("-").map(Number), t = new Date(y, mo - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 90 ? "baru saja" : s < 5400 ? Math.round(s / 60) + " menit lalu" : s < 129600 ? Math.round(s / 3600) + " jam lalu" : Math.round(s / 86400) + " hari lalu"; };
function closeLedger() { $("ledger").hidden = true; ledgerMonth = null; syncSheet(); }
$("btn-ledger").onclick = () => openLedger();
async function openLedger(month) {
  if (guest) return;
  ledgerMonth = month || ledgerMonth || new Date().toLocaleDateString("sv-SE").slice(0, 7);
  const m = ledgerMonth, el = $("ledger"); el.hidden = false; syncSheet();
  const get = (u) => fetch(u, { headers: headers() }).then((r) => r.json());
  const [e, s, bk] = await Promise.all([get(`/api/ledger/entries?month=${m}`), get(`/api/ledger/summary?month=${m}`), get("/api/backup/status")]).catch(() => []);
  if (!e || !s || m !== ledgerMonth) return;
  ledgerRows = e.entries || [];
  const cat = (jenis) => (s.per_kategori || []).filter((c) => c.jenis === jenis), maxCat = Math.max(1, ...(s.per_kategori || []).map((c) => c.total));
  const bars = (list) => list.map((c) => `<div class="cat"><span>${esc(c.kategori)}</span><i style="width:${Math.round((c.total / maxCat) * 100)}%"></i><b>${rp(c.total)}</b></div>`).join("") || "<small>-</small>";
  const rows = ledgerRows.filter((r) => ledgerShowVoid || r.status !== "void");
  const stLabel = { booked: "tercatat", pending: "menunggu", void: "ditolak" };
  const backupLine = !bk || bk.error && !bk.count ? `<span class="bad">Cadangan: belum ada</span>` : bk.count
    ? `<span class="${bk.ok ? "" : "bad"}">Cadangan terakhir: ${ago(bk.at)} · ${Math.max(1, Math.round(bk.size / 1024))} KB · ${bk.count} berkas${bk.ok ? "" : " — TERLAMBAT"}</span>` : `<span class="bad">Cadangan: belum ada</span>`;
  el.innerHTML = `<div class="hd"><h2>Pembukuan</h2><span></span><button id="l-prev">‹</button><b class="mo">${esc(monthLabel(m))}</b><button id="l-next">›</button><button id="l-close">Tutup</button></div>
    <div class="cards"><div class="card in"><small>Pemasukan</small><b>${rp(s.pemasukan_total)}</b></div><div class="card out"><small>Pengeluaran</small><b>${rp(s.pengeluaran_total)}</b></div>
      <div class="card ${s.selisih < 0 ? "out" : "in"}"><small>Selisih</small><b>${s.selisih < 0 ? "−" : ""}${rp(Math.abs(s.selisih))}</b></div><div class="card ${s.menunggu_persetujuan ? "wait" : ""}"><small>Menunggu persetujuan</small><b>${s.menunggu_persetujuan}</b></div></div>
    <div class="cols"><div><h4>Pengeluaran per kategori</h4>${bars(cat("pengeluaran"))}</div><div><h4>Pemasukan per kategori</h4>${bars(cat("pemasukan"))}</div></div>
    <div class="tools"><label><input type="checkbox" id="l-void" ${ledgerShowVoid ? "checked" : ""}> tampilkan yang ditolak</label><span></span><button id="l-csv">Unduh CSV</button></div>
    <div class="tbl"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th class="r">Jumlah</th><th>Status</th></tr></thead><tbody>${rows.map((r) =>
      `<tr class="${esc(r.status)}"><td>${esc(r.date)}</td><td>${r.kind === "in" ? "masuk" : "keluar"}</td><td>${esc(r.category)}</td><td>${esc(r.note || "-")}</td><td class="r ${r.kind}">${r.kind === "in" ? "+" : "−"}${rp(r.amount)}</td><td><span class="badge ${r.status === "booked" ? "done" : r.status === "void" ? "cancelled" : "running"}">${stLabel[r.status] || esc(r.status)}</span></td></tr>`).join("")
      || `<tr><td colspan="6"><small>Belum ada catatan di bulan ini.</small></td></tr>`}</tbody></table></div>
    <div class="foot">${backupLine}<span></span><button id="l-backup">Cadangkan sekarang</button></div>`;
  $("l-close").onclick = closeLedger; $("l-prev").onclick = () => openLedger(shiftMonth(m, -1)); $("l-next").onclick = () => openLedger(shiftMonth(m, 1));
  $("l-void").onchange = (ev) => { ledgerShowVoid = ev.target.checked; openLedger(m); };
  $("l-backup").onclick = async (ev) => { ev.target.disabled = true; ev.target.textContent = "Mencadangkan…"; const r = await fetch("/api/backup/run", { method: "POST", headers: headers() }); if (!r.ok) alert("Cadangan gagal: " + ((await r.json().catch(() => ({}))).error || r.status)); openLedger(m); };
  $("l-csv").onclick = () => {                                       // unduh CSV; sel yang diawali = + - @ diberi tanda kutip agar tidak dieksekusi Excel
    const cell = (v) => { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const csv = "﻿" + ["Tanggal,Jenis,Kategori,Keterangan,Jumlah (Rp),Status", ...rows.map((r) => [r.date, r.kind === "in" ? "masuk" : "keluar", r.category, r.note, r.amount, stLabel[r.status] || r.status].map((v, i) => i === 4 ? v : cell(v)).join(","))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `pembukuan-${m}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}

// ---------- Atur karyawan: instruksi tetap + rutinitas (khusus admin) ----------
const EVERY = [[60, "1 jam"], [120, "2 jam"], [180, "3 jam"], [360, "6 jam"], [720, "12 jam"], [1440, "1 hari"], [2880, "2 hari"], [10080, "1 minggu"]];
const everyLabel = (m) => (EVERY.find((x) => x[0] === m) || [0, m % 1440 === 0 ? m / 1440 + " hari" : m / 60 + " jam"])[1];
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";
let cfgBot = null, cfgEdit = null;
function closeCfg() { $("cfg").hidden = true; cfgBot = null; cfgEdit = null; syncSheet(); }
async function openCfg(botId, keepText) {
  if (guest) return; cfgBot = botId; const el = $("cfg"), b = state.bots[botId]; el.hidden = false; syncSheet();
  const keep = keepText !== undefined ? keepText : null;
  const d = await fetch("/api/routines", { headers: headers() }).then((r) => r.json()).catch(() => null); if (!d || cfgBot !== botId) return;
  const mine = d.routines.filter((r) => r.bot_id === botId), edit = mine.find((r) => r.id === cfgEdit), est = mine.filter((r) => r.enabled).reduce((s, r) => s + r.est_tasks_per_day, 0);
  el.innerHTML = `<div class="hd"><h2>Atur · ${esc(b.name)}</h2><span></span><button id="c-close">Tutup</button></div>
    <div class="sub">${esc(shortRole(b.role))}. Instruksi dan rutinitas berlaku untuk semua tugas agen ini, termasuk yang berjalan otomatis.</div>
    <h4>Instruksi tetap <small>(seperti "Instructions" di GPTs)</small></h4>
    <textarea id="c-standing" rows="5" maxlength="2000" placeholder="Contoh: Selalu jawab singkat. Fokus pada SocialHub. Jangan menyebut harga.">${esc(keep ?? b.standing ?? "")}</textarea>
    <div class="crow"><button class="primary" id="c-save">Simpan instruksi</button><small id="c-msg"></small></div>
    <h4>Rutinitas — kerja otomatis berjadwal</h4>
    <div class="rtl">${mine.map((r) => `<div class="rt-item ${r.enabled ? "on" : ""}"><div class="rt-main"><b>${esc(r.name)}</b><small>tiap ${esc(everyLabel(r.every_minutes))} · jam ${r.window_start}–${r.window_end} WIB · ${r.enabled ? "berikutnya " + esc(fmtTime(r.next_run)) : "nonaktif"}${r.last_run ? " · terakhir " + esc(fmtTime(r.last_run)) : ""}</small><span>${esc(r.instruction)}</span></div>
      <div class="rt-act"><label class="sw"><input type="checkbox" data-en="${r.id}" ${r.enabled ? "checked" : ""}> aktif</label><button data-run="${r.id}">Jalankan</button><button data-edit="${r.id}">Ubah</button><button class="cancel" data-del="${r.id}">Hapus</button></div></div>`).join("") || "<small>Belum ada rutinitas. Tambahkan di bawah; semuanya nonaktif sampai Anda menyalakannya.</small>"}</div>
    <h4>${edit ? "Ubah rutinitas" : "Tambah rutinitas"}</h4>
    <input id="c-name" maxlength="60" placeholder="Nama rutinitas (mis. Draf konten harian)" value="${esc(edit?.name ?? "")}">
    <textarea id="c-ins" rows="3" maxlength="1500" placeholder="Apa yang dikerjakan setiap kali jalan (instruksi lengkap, mandiri)">${esc(edit?.instruction ?? "")}</textarea>
    <div class="crow"><label>Tiap <select id="c-every">${EVERY.map(([m, l]) => `<option value="${m}" ${(edit?.every_minutes ?? 1440) === m ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="primary" id="c-add">${edit ? "Simpan perubahan" : "Tambah"}</button>${edit ? `<button id="c-cancel">Batal</button>` : ""}</div>
    <div class="foot2">Perkiraan beban: rutinitas aktif karyawan ini ±${est.toFixed(1)} tugas/hari (tiap tugas ±1–4 panggilan AI). Batas global ${d.auto.used_today}/${d.auto.daily_max} tugas otomatis hari ini${d.auto.paused ? " — SEDANG DIJEDA" : ""}. Interval minimal 1 jam.</div>`;
  const msg = (t, bad) => { const m = $("c-msg"); if (m) { m.textContent = t; m.style.color = bad ? "var(--error)" : "var(--done)"; } };
  const post = (u, body) => fetch(u, { method: "POST", headers: headers(), body: JSON.stringify(body ?? {}) });
  const reload = () => { lastVersion = -1; poll(); openCfg(botId, $("c-standing").value); };
  $("c-close").onclick = closeCfg;
  $("c-save").onclick = async () => { const r = await post(`/api/bots/${botId}/standing`, { text: $("c-standing").value }); msg(r.ok ? "Tersimpan ✓" : "Gagal menyimpan", !r.ok); if (r.ok) { state.bots[botId].standing = $("c-standing").value.trim(); lastVersion = -1; poll(); } };
  el.querySelectorAll("[data-en]").forEach((c) => c.onchange = async () => { await post(`/api/routines/${c.dataset.en}/update`, { enabled: c.checked }); reload(); });
  el.querySelectorAll("[data-run]").forEach((c) => c.onclick = async () => { const r = await post(`/api/routines/${c.dataset.run}/run`); if (!r.ok) alert((await r.json().catch(() => ({}))).error || "Gagal"); else alert("Tugas dimulai. Hasilnya muncul di papan tugas ruangan ini."); reload(); });
  el.querySelectorAll("[data-del]").forEach((c) => c.onclick = async () => { if (confirm("Hapus rutinitas ini?")) { await post(`/api/routines/${c.dataset.del}/delete`); cfgEdit = null; reload(); } });
  el.querySelectorAll("[data-edit]").forEach((c) => c.onclick = () => { cfgEdit = Number(c.dataset.edit); openCfg(botId, $("c-standing").value); });
  if ($("c-cancel")) $("c-cancel").onclick = () => { cfgEdit = null; openCfg(botId, $("c-standing").value); };
  $("c-add").onclick = async () => {
    const body = { name: $("c-name").value, instruction: $("c-ins").value, every_minutes: Number($("c-every").value) };
    const r = edit ? await post(`/api/routines/${edit.id}/update`, body) : await post("/api/routines", { ...body, bot: botId });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || "Gagal"); return; } cfgEdit = null; reload();
  };
}

// ---------- login (form ditangani boot.js) ----------
function logout() { try { localStorage.removeItem("office.token"); } catch {} location.reload(); }
$("btn-logout").onclick = () => logout();
poll();                                                   // tamu maupun admin; tombol "Masuk admin" ditangani boot.js

// ---------- interaksi ----------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(ev) {
  mouse.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const botMeshes = []; bots.forEach((b) => b.body.traverse((o) => o.isMesh && botMeshes.push(o)));
  const hb = ray.intersectObjects([...botMeshes, ...boardMeshes], false)[0];
  if (hb && hb.object.userData.boardRoom) return { board: hb.object.userData.boardRoom };
  if (hb) { let o = hb.object; while (o && !o.userData.botId) o = o.parent; if (o) return { bot: o.userData.botId }; }
  const hf = ray.intersectObjects(floors, false)[0]; return hf ? { room: hf.object.userData.roomId } : {};
}
renderer.domElement.addEventListener("pointermove", (e) => { const h = pick(e); renderer.domElement.style.cursor = h.bot || h.board || (h.room && h.room !== focusedRoom) ? "pointer" : "default"; });
renderer.domElement.addEventListener("click", (e) => {
  const h = pick(e);
  if (h.board) { if (h.board !== focusedRoom) focusRoom(h.board); select(null); openBoard(h.board); }
  else if (h.bot) { const b = state.bots[h.bot]; if (b.room !== focusedRoom) focusRoom(b.room); select(h.bot); }
  else if (h.room) { if (h.room !== focusedRoom) focusRoom(h.room); select(null); }
});
addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("cfg").hidden) closeCfg(); else if (!$("ledger").hidden) closeLedger(); else if (boardRoom) closeBoard(); else { focusRoom(null); select(null); } } });

// ---------- loop ----------
const clock = new THREE.Clock(); let t = 0, qSlow = 0, qAcc = 0, qN = 0, qStep = 0, fpsNow = 0, fpsF = 0, fpsT = performance.now();
// Turunkan kualitas grafis bertahap: langkah 1 = resolusi 1x, langkah 2 = tanpa bayangan. ?keep menonaktifkan.
function degradeQuality(avg) {
  if (qStep >= 2 || Q.has("keep")) return;
  qStep++;
  if (qStep === 1 && pixelScale > 1) { pixelScale = 1; resize(); }
  else { qStep = 2; renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
  console.info("kualitas grafis diturunkan, langkah", qStep, "(rata-rata", Math.round(1 / (avg || 0.04)), "fps)");
}

renderer.setAnimationLoop(() => {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.1); t += dt;
  fpsF++; { const np = performance.now(); if (np - fpsT >= 1000) { fpsNow = Math.round(fpsF * 1000 / (np - fpsT)); fpsF = 0; fpsT = np; } }
  qAcc += rawDt; if (++qN === 90) {                                                         // tiap ±90 bingkai: terlalu lambat? turunkan kualitas bertahap (cegah petak gambar yang telat/berkedip)
    const avg = qAcc / qN; qAcc = 0; qN = 0;
    if (t > 20 && avg > 0.034) { if (++qSlow >= 2) { qSlow = 0; degradeQuality(avg); } } else qSlow = 0;
  }
  const perRoom = {}, workN = {};
  bots.forEach((b) => { const i = (perRoom[b.data.room] = (perRoom[b.data.room] ?? -1) + 1); const w = b.status === "working" ? (workN[b.data.room] = (workN[b.data.room] ?? -1) + 1) : 0; b.update(dt, t, i, w); });
  const occupied = new Set(); bots.forEach((b) => { if (b.seated) occupied.add(b.data.room); });             // layar laptop menyala berdenyut bila ada yang duduk bekerja
  for (const [rid, g] of Object.entries(roomGroups)) { const m = g.userData.screen; if (m) m.emissiveIntensity = occupied.has(rid) ? 0.8 + 0.25 * Math.sin(t * 9) : 0.12; }
  const sheet = [$("panel"), $("board"), $("ledger")].find((x) => !x.hidden), sheetPx = innerWidth <= 760 && sheet ? Math.min(sheet.offsetHeight, innerHeight * 0.8) : 0;
  if (sheetPx !== lastSheetPx) { lastSheetPx = sheetPx; sheetPx ? camera.setViewOffset(innerWidth, innerHeight, 0, sheetPx / 2 - 20, innerWidth, innerHeight) : camera.clearViewOffset(); }     // ruangan tampil di bagian layar yang masih terlihat
  const aspect = innerWidth / innerHeight, d0 = view.pos.distanceTo(view.look), fit = Math.max(1, (view.fitW || 0) / (2 * 0.4142 * aspect) / d0);   // layar tegak: mundurkan kamera agar lebar tetap muat
  const goal = view.pos.clone().sub(view.look).multiplyScalar(zoomK * fit).add(view.look);
  camera.position.lerp(goal, 1 - Math.pow(0.001, dt)); curLook.lerp(view.look, 1 - Math.pow(0.001, dt)); camera.lookAt(curLook);
  const lk = Math.min(2.4, Math.max(0.3, camera.position.distanceTo(curLook) / 60));      // label dijaga ukurannya di layar (tidak raksasa saat zoom)
  const fixLabel = (sp) => { if (sp?.userData.base) sp.scale.copy(sp.userData.base).multiplyScalar(lk); };
  const crowd = !focusedRoom && aspect < 1;                                            // layar tegak & semua ruangan: terlalu sesak untuk nama karyawan
  labelSprites.forEach((sp) => { fixLabel(sp); if (crowd) sp.scale.multiplyScalar(0.72); sp.visible = !focusedRoom || sp.userData.room === focusedRoom; });   // di dalam ruangan: hanya label ruangan itu
  bots.forEach((b) => { fixLabel(b.name); fixLabel(b.bang); Object.values(b.bubbles).forEach(fixLabel); b.name.visible = !crowd; });
  renderer.render(scene, camera);
});

// Kait pengujian (hanya aktif bila alamat memakai ?debug): memungkinkan skrip uji memilih bot/ruangan seperti klik pengguna.
if (new URLSearchParams(location.search).has("debug")) window.__office = {
  pickBot: (id) => { const b = state.bots[id]; if (b.room !== focusedRoom) focusRoom(b.room); select(id); },
  pickRoom: (id) => { focusRoom(id); select(null); }, openBoard: (id) => { if (id !== focusedRoom) focusRoom(id); openBoard(id); }, openLedger, closeBoard,
  botIds: () => Object.keys(state?.bots || {}),
  degrade: () => degradeQuality(0.05),
  openCfg: (id) => openCfg(id),
  quality: () => ({ pixelRatio: pixelScale, shadows: renderer.shadowMap.enabled, step: qStep }),
  forceStatus: (id, st) => { const b = bots.get(id); b.status = st; b.data = { ...b.data, effective_status: st }; },
  screenOf: (kind, id) => { const v = new THREE.Vector3(); (kind === "bot" ? bots.get(id).root : boards[id].group).getWorldPosition(v); v.y += kind === "bot" ? 0.7 : 1.5; v.project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; },
};


// ---------- navigasi mobile: chip ruangan, feed lipat, cubit untuk zoom ----------
const chips = $("rooms");
chips.innerHTML = `<button data-room="">Semua</button>` + Object.entries(LAYOUT).filter(([, L]) => !L.decor).map(([id, L]) => `<button data-room="${id}">${esc(L.label)}</button>`).join("");
chips.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; select(null); focusRoom(b.dataset.room || null); };
function markRooms() { renderRoster(); renderRoomList(); chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b.dataset.room || null) === focusedRoom)); }
markRooms();
$("feed").onclick = () => $("feed").classList.toggle("open");
let pinch = 0;
const cv = renderer.domElement;
cv.addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
cv.addEventListener("touchmove", (e) => { if (e.touches.length !== 2 || !pinch) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); zoomK = Math.min(1.6, Math.max(0.45, zoomK * (pinch / d))); pinch = d; }, { passive: true });
cv.addEventListener("touchend", () => { pinch = 0; }, { passive: true });


// Panel diagnosis grafis (hanya bila alamat memakai ?diag): menampilkan GPU, skala layar, ukuran buffer, fps.
if (Q.has("diag")) {
  const el = document.createElement("pre"); el.id = "diag"; document.body.appendChild(el);
  const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info"), gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "(tidak diketahui)";
  setInterval(() => { el.textContent = `GPU   : ${gpu}\nlayar : dpr ${devicePixelRatio} | css ${innerWidth}x${innerHeight} | buffer ${renderer.domElement.width}x${renderer.domElement.height}\nmutu  : skala ${pixelScale} | bayangan ${renderer.shadowMap.enabled ? "ya" : "tidak"} | fps ${fpsNow} | profil ${SAFE ? "aman" : "penuh"}`; }, 1000);
}
