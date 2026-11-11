import http from "node:http"; import { readFile, readdir, stat } from "node:fs/promises"; import { execFile } from "node:child_process"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url"; import crypto from "node:crypto"; import pg from "pg";
const { DATABASE_URL, OFFICE_PORT = 4100, OFFICE_HOST = "0.0.0.0", OFFICE_ADMIN_TOKEN } = process.env;
if (!OFFICE_ADMIN_TOKEN) throw new Error("OFFICE_ADMIN_TOKEN kosong");
const db = new pg.Pool({ connectionString: DATABASE_URL });
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)),"..","web");
const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".glb":"model/gltf-binary"};
// Versi dashboard = waktu ubah file web terbaru. Dipasang di URL modul/gaya supaya cache (browser/Cloudflare) tidak memakai file lama.
async function webVersion() {
  let m = 0; for (const f of await readdir(WEB)) { const st = await stat(path.join(WEB, f)); if (st.isFile()) m = Math.max(m, st.mtimeMs); }
  return Math.floor(m).toString(36);
}
function withVersion(ext, data, v) {
  if (ext === ".js") return data.toString().replace(/(from\s+["'])(\.\/[\w.\-\/]+\.js)(["'])/g, `$1$2?v=${v}$3`);
  if (ext === ".html") return data.toString().replace(/((?:src|href)=")(\.\/[\w.\-\/]+\.(?:js|css))(")/g, `$1$2?v=${v}$3`);
  return data;
}
const HANDOFF = { "ops-bot": ["engineer-socialhub", "engineer-nxbooth", "engineer-nxchat", "engineer-gennexbyte"] };   // pengirim -> penerima yang diizinkan
// ===== Mode tamu: hanya data yang sudah DISARING di sini yang pernah keluar tanpa login =====
const GUEST_ON = (process.env.OFFICE_GUEST_MODE || "on").toLowerCase() !== "off";
const WORD = { working: "bekerja", idle: "menunggu tugas", waiting_user: "menunggu keputusan", error: "ada kendala", done: "selesai" };
const HIDDEN = "(isi disembunyikan)";
// Tamu hanya melihat potongan AWAL teks, dengan data yang mudah dikenali disamarkan. Ruangan sensitif disembunyikan penuh.
const NO_PREVIEW = new Set((process.env.OFFICE_GUEST_NO_PREVIEW_ROOMS ?? "finance,director").split(",").map((x) => x.trim()).filter(Boolean));
const PREVIEW = { instruction: 70, result: 90 };
function preview(text, max) {
  let t = String(text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/^\s*#{1,6}\s+/gm, "").replace(/^\s*[-*•]\s+/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "•••@•••")                      // email
       .replace(/https?:\/\/[^\s?#]+[^\s]*/g, (u) => { try { return new URL(u).origin; } catch { return "•••"; } })   // URL: hanya domain, tanpa path/query
       .replace(/\bRp\.?\s?[\d.,]+/gi, "Rp •••").replace(/\b\d[\d.,]{5,}\b/g, "•••")   // nominal & angka panjang
       .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "•••");                                  // string mirip token/kunci
  if (t.length <= max) return t;
  const cut = t.slice(0, max), sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + "…";
}
const pubText = (t, text, max) => text == null ? null : t.is_public ? text : NO_PREVIEW.has(t.room) ? HIDDEN : preview(text, max);
const pubTask = (t) => ({ id: t.id, bot: t.bot, room: t.room, from_bot: t.from_bot, routine: t.routine ?? null, state: t.state, created_at: t.created_at, finished_at: t.finished_at ?? null, is_public: !!t.is_public,
  instruction: pubText(t, t.instruction, PREVIEW.instruction), result: pubText(t, t.result, PREVIEW.result) });
async function publicState() {
  const s = await state();
  return { guest: true, version: s.version, rooms: s.rooms, retention_days: s.retention_days, tasks24h: s.tasks24h,
    bots: Object.fromEntries(Object.values(s.bots).map((b) => [b.id, { id: b.id, name: b.name, role: b.role, room: b.room, look: b.look, remote: b.remote, seen_ms: b.seen_ms,
      visit_room: b.visit_room, visit_ms: b.visit_ms, effective_status: b.effective_status, step: WORD[b.effective_status] || "" }])),
    approvals: [], approvals_count: s.approvals.length,
    events: s.events.map((e) => ({ id: e.id, bot: e.bot, status: e.status, step: WORD[e.status] || "", at: e.at })),
    board: Object.fromEntries(Object.entries(s.board).map(([k, v]) => [k, v.map(pubTask)])) };
}
let pubCache = { t: 0, v: null };
const cachedPublicState = async () => { if (Date.now() - pubCache.t < 1000 && pubCache.v) return pubCache.v; const v = await publicState(); pubCache = { t: Date.now(), v }; return v; };
const hits = new Map();                                                    // batas laju per IP untuk endpoint tamu
function limited(req) {
  const ip = req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?", now = Date.now(), h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + 60000 }); return false; }
  return ++h.n > 120;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now > h.reset) hits.delete(k); }, 300000);
const CATS = ["hosting","domain","gaji","iklan","langganan","peralatan","pajak","pemasukan-klien","pemasukan-lain","lain-lain"];
const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
// ===== Otomasi: instruksi tetap + rutinitas berjadwal (dengan rem pengaman) =====
const INACTIVE_BOTS = new Set(["clipper-bot"]);                       // belum punya kemampuan kerja; rutinitas ditolak
const getMeta = async (k, d) => { const r = await db.query("SELECT v FROM meta WHERE k=$1",[k]); return r.rowCount ? Number(r.rows[0].v) : d; };
const setMeta = (k, v) => db.query("INSERT INTO meta(k,v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2",[k,v]);
const jakartaHour = () => Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
const usedToday = async () => (await db.query("SELECT count(*)::int AS n FROM tasks WHERE routine_id IS NOT NULL AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')")).rows[0].n;
async function autoInfo() { return { paused: !!(await getMeta("auto_paused",0)), daily_max: await getMeta("auto_daily_max",30), used_today: await usedToday() }; }
let autoCache = { t: 0, v: null };
const autoCached = async () => { if (Date.now()-autoCache.t < 5000 && autoCache.v) return autoCache.v; autoCache = { t: Date.now(), v: await autoInfo() }; return autoCache.v; };
async function startRoutine(r) {                                      // buat tugas dari rutinitas; ditolak bila batas harian tercapai atau rutinitas masih berjalan
  const info = await autoInfo(); if (info.used_today >= info.daily_max) return { ok:false, error:`batas harian otomatis tercapai (${info.daily_max} tugas)` };
  if ((await db.query("SELECT 1 FROM tasks WHERE routine_id=$1 AND state IN ('queued','running')",[r.id])).rowCount) return { ok:false, error:"rutinitas ini masih antre/berjalan" };
  const t = await db.query("INSERT INTO tasks(bot_id,instruction,routine_id) VALUES ($1,$2,$3) RETURNING id",[r.bot_id,r.instruction,r.id]);
  await db.query("UPDATE routines SET last_run=now(), next_run=now() + make_interval(mins => every_minutes) WHERE id=$1",[r.id]); autoCache.t = 0;
  return { ok:true, task_id:Number(t.rows[0].id) };
}
async function routineTick() {
  try {
    if ((await autoInfo()).paused) return;
    const h = jakartaHour(), due = await db.query("SELECT * FROM routines WHERE enabled AND next_run IS NOT NULL AND next_run <= now() ORDER BY next_run LIMIT 20");
    let started = false;
    for (const r of due.rows) {
      if (!(h >= r.window_start && h < r.window_end)) continue;       // di luar jam aktif: tunggu
      const res = await startRoutine(r);
      if (res.ok) { started = true; console.log("rutinitas jalan:", r.name, "-> tugas", res.task_id); }
      else await db.query("UPDATE routines SET next_run = now() + interval '10 minutes' WHERE id=$1",[r.id]);
    }
    if (started) await bump();
  } catch (e) { console.error("rutinitas:", e.message); }
}
setTimeout(routineTick, 30000); setInterval(routineTick, 60000);
// ===== Statistik kartu karyawan (dihitung dari catatan nyata; versi tamu tanpa teks langkah) =====
async function botStats(id, full) {
  const bot = (await db.query("SELECT id,status FROM bots WHERE id=$1",[id])).rows[0]; if (!bot) return null;
  const [steps, tasks, worked, share, since, recent] = await Promise.all([
    db.query("SELECT count(*)::int AS n FROM events WHERE bot_id=$1",[id]),
    db.query("SELECT count(*) FILTER (WHERE state='done')::int AS done, count(*) FILTER (WHERE state='failed')::int AS failed, count(*)::int AS total FROM tasks WHERE bot_id=$1 AND created_at > now() - make_interval(days => $2)",[id,RET]),
    db.query("SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (nxt - at)), 1800)),0)::int AS sec FROM (SELECT status, at, LEAD(at) OVER (ORDER BY id) AS nxt FROM events WHERE bot_id=$1) e WHERE status='working' AND nxt IS NOT NULL",[id]),
    db.query("SELECT (SELECT count(*) FROM tasks WHERE bot_id=$1 AND created_at > now() - make_interval(days => $2))::float / GREATEST(1,(SELECT count(*) FROM tasks WHERE created_at > now() - make_interval(days => $2))) AS p",[id,RET]),
    db.query("SELECT min(at) AS since FROM events WHERE bot_id=$1 AND id > COALESCE((SELECT max(id) FROM events WHERE bot_id=$1 AND status <> $2),0)",[id,bot.status]),
    db.query("SELECT at, status, step FROM events WHERE bot_id=$1 ORDER BY id DESC LIMIT 6",[id])]);
  return { days: RET, steps: steps.rows[0].n, tasks: tasks.rows[0], worked_sec: worked.rows[0].sec, share_pct: Math.round(share.rows[0].p * 100), since: since.rows[0].since,
    recent: recent.rows.map((r) => ({ at: r.at, status: r.status, step: full ? r.step : (WORD[r.status] || "") })) };
}
const STATUSES = ["working","idle","waiting_user","error","done"];
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const eq = (a,b) => a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const bump = (q=db) => q.query("UPDATE meta SET v=v+1 WHERE k='version' RETURNING v").then(r=>Number(r.rows[0].v));
const RET = Math.max(1, Math.min(60, Number(process.env.OFFICE_RETENTION_DAYS) || 5));   // lama simpan tugas/hasil (hari)
async function purge() {
  try {
    const a = await db.query("DELETE FROM tasks WHERE created_at < now() - make_interval(days => $1) AND state<>'running'", [RET]);
    const b = await db.query("DELETE FROM events WHERE at < now() - make_interval(days => $1)", [RET]);
    const c = await db.query("DELETE FROM approvals WHERE state<>'pending' AND created_at < now() - make_interval(days => $1)", [RET]);
    const n = a.rowCount + b.rowCount + c.rowCount; if (n) { await bump(); console.log("purge: hapus", n, "baris lebih tua dari", RET, "hari"); }
  } catch (e) { console.error("purge:", e.message); }
}
purge(); setInterval(purge, 3600_000);
// ===== Cadangan database otomatis: jalan bila cadangan terakhir > 24 jam (dicek tiap jam & saat start) =====
const BACKUP_DIR = process.env.OFFICE_BACKUP_DIR || path.join(os.homedir(), "office-backups");
const BACKUP_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "backup-db.sh");
let backupRunning = false, backupError = null;
async function latestBackup() {
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => /^office-\d{8}-\d{6}\.sql\.gz$/.test(f)).sort();
    if (!files.length) return { count: 0 };
    const st = await stat(path.join(BACKUP_DIR, files.at(-1)));
    return { count: files.length, name: files.at(-1), at: st.mtime.toISOString(), size: st.size };
  } catch { return { count: 0 }; }
}
function runBackup() {
  if (backupRunning) return Promise.resolve({ ok: false, error: "cadangan sedang berjalan" });
  backupRunning = true;
  return new Promise((resolve) => execFile("bash", [BACKUP_SCRIPT], { timeout: 300000, env: { ...process.env, OFFICE_BACKUP_DIR: BACKUP_DIR } }, (err, out, errout) => {
    backupRunning = false; backupError = err ? String(errout || err.message).slice(0, 200) : null;
    if (err) console.error("cadangan gagal:", backupError); else console.log("cadangan:", String(out).trim());
    resolve(err ? { ok: false, error: backupError } : { ok: true });
  }));
}
async function backupTick() { const l = await latestBackup(); if (!l.count || Date.now() - Date.parse(l.at) > 24 * 3600000) await runBackup(); }
setTimeout(backupTick, 20000); setInterval(backupTick, 3600000);
// Rantai percakapan: tugas-tugas sebelumnya (paling lama dulu) yang menjadi konteks tugas lanjutan
async function ancestors(id, max) {
  const r = await db.query(`WITH RECURSIVE up AS (SELECT id, parent_id, instruction, result, state, 0 AS d FROM tasks WHERE id=(SELECT parent_id FROM tasks WHERE id=$1)
    UNION ALL SELECT t.id, t.parent_id, t.instruction, t.result, t.state, up.d+1 FROM tasks t JOIN up ON t.id=up.parent_id WHERE up.d < $2)
    SELECT id, instruction, result, state FROM up ORDER BY d DESC`,[id, max - 1]);
  return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
}
async function taskContext(id) {
  const chain = await ancestors(id, 4); if (!chain.length) return "";
  return "Ini lanjutan percakapan. Riwayat sebelumnya (paling lama dulu):\n" + chain.map((c) =>
    `--- Tugas #${c.id} (${c.state})\nPemilik: ${String(c.instruction).slice(0, 800)}\nHasilmu: ${String(c.result ?? "(belum ada hasil)").slice(0, 1500)}`).join("\n");
}
const bearer = (req) => (req.headers.authorization||"").replace(/^Bearer /,"");
const isAdmin = (req) => { const t=bearer(req); return !!t && eq(t,OFFICE_ADMIN_TOKEN); };
async function botFrom(req){ const t=bearer(req); if(!t) return null;
  const b = (await db.query("SELECT * FROM bots WHERE token_hash=$1",[sha(t)])).rows[0]||null;
  if (b) db.query("UPDATE bots SET last_seen=now() WHERE id=$1",[b.id]).catch(()=>{});
  return b; }
const body = (req) => new Promise((ok,no)=>{ let d=""; req.on("data",c=>{d+=c; if(d.length>20000){no(new Error("terlalu besar")); req.destroy();}});
  req.on("end",()=>{try{ok(d?JSON.parse(d):{})}catch(e){no(new Error("JSON tidak valid"))}}); });
const send = (res,code,obj)=>{ res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"}); res.end(JSON.stringify(obj)); };

async function state(){
  const [rooms,bots,ap,v,ev,tk,cnt] = await Promise.all([
    db.query("SELECT id,name,kind,theme,ord FROM rooms ORDER BY ord"),
    db.query("SELECT id,name,role,standing,room_id AS room,backend,look,chat_url,status AS effective_status,step,updated_at, CASE WHEN visit_until > now() THEN visit_room END AS visit_room, CASE WHEN visit_until > now() THEN (EXTRACT(EPOCH FROM (visit_until-now()))*1000)::int ELSE 0 END AS visit_ms, remote, CASE WHEN last_seen IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM (now()-last_seen))*1000)::bigint END AS seen_ms FROM bots ORDER BY name"),
    db.query("SELECT id,bot_id,action,detail,created_at FROM approvals WHERE state='pending' ORDER BY id"),
    db.query("SELECT v FROM meta WHERE k='version'"),
    db.query("SELECT e.id,e.bot_id,b.name AS bot,e.status,e.step,e.at FROM events e JOIN bots b ON b.id=e.bot_id ORDER BY e.id DESC LIMIT 30"),
    db.query("SELECT t.id,t.bot_id,b.name AS bot,b.room_id AS room,t.instruction,t.state,t.result,t.created_at,t.is_public,fb.name AS from_bot, ro.name AS routine FROM tasks t JOIN bots b ON b.id=t.bot_id LEFT JOIN bots fb ON fb.id=t.from_bot LEFT JOIN routines ro ON ro.id=t.routine_id WHERE t.created_at > now() - make_interval(days => $1) ORDER BY t.id DESC LIMIT 300",[RET]),
    db.query("SELECT state, count(*)::int AS n FROM tasks WHERE created_at > now() - interval '24 hours' GROUP BY state")]);
  const tasks24h = { done: 0, failed: 0, running: 0, queued: 0 }; for (const r of cnt.rows) tasks24h[r.state] = r.n;
  const auto = await autoCached();
  const board = { lobby: [] };
  for (const r of tk.rows) { const row = { ...r, id: Number(r.id), result: r.result ? r.result.slice(0,160) : null };
    const l = (board[r.room] ||= []); if (l.length < 5) l.push(row); if (board.lobby.length < 5) board.lobby.push(row); }
  return { version:Number(v.rows[0].v), rooms:rooms.rows, bots:Object.fromEntries(bots.rows.map(b=>[b.id,b])), approvals:ap.rows, events:ev.rows, board, tasks24h, auto, retention_days:RET };
}

http.createServer(async (req,res)=>{
  try{
    const url = new URL(req.url,"http://x"); const p = url.pathname;
    if (p==="/api/health") return send(res,200,{ok:true});
    if (req.method==="GET" && !p.startsWith("/api/")){            // dashboard statis dari folder web/
      const file = path.resolve(WEB, "."+(p==="/"?"/index.html":p));
      if (!file.startsWith(WEB+path.sep)) return send(res,403,{error:"dilarang"});
      try { const ext = path.extname(file), data = withVersion(ext, await readFile(file), await webVersion());
        res.writeHead(200,{"content-type":MIME[ext]||"application/octet-stream","cache-control":"no-cache"}); return res.end(data);
      } catch { return send(res,404,{error:"tidak ditemukan"}); }
    }
    if (p.startsWith("/api/public/")) {                          // tanpa login, hanya baca, data tersaring
      if (!GUEST_ON) return send(res,403,{error:"mode tamu dimatikan"});
      if (req.method !== "GET") return send(res,405,{error:"hanya baca"});
      if (limited(req)) return send(res,429,{error:"terlalu sering, coba sebentar lagi"});
      if (p === "/api/public/state") { const s = await cachedPublicState(); const since = Number(url.searchParams.get("since"));
        return send(res,200, since===s.version ? {version:s.version,unchanged:true,seen:Object.fromEntries(Object.values(s.bots).filter(b=>b.remote).map(b=>[b.id,b.seen_ms===null?null:Number(b.seen_ms)]))} : s); }
      if (p === "/api/public/bot") { const st = await botStats(String(url.searchParams.get("id")||""), false); return st ? send(res,200,st) : send(res,404,{error:"tidak ada"}); }
      if (p === "/api/public/board") { const room = url.searchParams.get("room");
        const r = await db.query(`SELECT t.id,t.bot_id,b.name AS bot,b.room_id AS room,t.instruction,t.state,t.result,t.created_at,t.finished_at,t.is_public,fb.name AS from_bot, ro.name AS routine
          FROM tasks t JOIN bots b ON b.id=t.bot_id LEFT JOIN bots fb ON fb.id=t.from_bot LEFT JOIN routines ro ON ro.id=t.routine_id WHERE t.created_at > now() - make_interval(days => $1)
          AND ($2::text IS NULL OR $2='lobby' OR b.room_id=$2) ORDER BY t.id DESC LIMIT 100`,[RET,room]);
        return send(res,200,{guest:true,retention_days:RET,tasks:r.rows.map(x=>pubTask({...x,id:Number(x.id)}))}); }
      return send(res,404,{error:"tidak ditemukan"});
    }
    // dashboard (baca) — admin token
    if (req.method==="GET" && p==="/api/state"){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const s = await state(); const since = Number(url.searchParams.get("since"));
      return send(res,200, since===s.version ? {version:s.version,unchanged:true,seen:Object.fromEntries(Object.values(s.bots).filter(b=>b.remote).map(b=>[b.id,b.seen_ms===null?null:Number(b.seen_ms)]))} : s);
    }
    // bot melapor status — token bot
    if (req.method==="POST" && p==="/api/event"){
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const b = await body(req);
      if(!STATUSES.includes(b.status)) return send(res,400,{error:"status harus salah satu dari "+STATUSES.join("|")});
      const step = String(b.step??"").slice(0,80);
      await db.query("UPDATE bots SET status=$2,step=$3,updated_at=now() WHERE id=$1",[bot.id,b.status,step]);
      await db.query("INSERT INTO events(bot_id,status,step) VALUES ($1,$2,$3)",[bot.id,b.status,step]);
      return send(res,200,{ok:true,version:await bump()});
    }
    // bot minta persetujuan manusia
    if (req.method==="POST" && p==="/api/approval"){
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const b = await body(req);
      const r = await db.query("INSERT INTO approvals(bot_id,action,detail) VALUES ($1,$2,$3) RETURNING id",[bot.id,String(b.action??"").slice(0,200),JSON.stringify(b.detail??{})]);
      await db.query("UPDATE bots SET status='waiting_user',step=$2,updated_at=now() WHERE id=$1",[bot.id,("minta persetujuan: "+(b.action??"")).slice(0,80)]);
      return send(res,200,{ok:true,approval_id:Number(r.rows[0].id),version:await bump()});
    }
    // manusia memutuskan — admin
    const m = p.match(/^\/api\/approval\/(\d+)\/(approve|reject)$/);
    if (req.method==="POST" && m){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const r = await db.query("UPDATE approvals SET state=$2,decided_at=now() WHERE id=$1 AND state='pending' RETURNING bot_id, ref_ledger",[m[1],m[2]==="approve"?"approved":"rejected"]);
      if(!r.rowCount) return send(res,404,{error:"tidak ada / sudah diputuskan"});
      if (r.rows[0].ref_ledger) await db.query("UPDATE ledger_entries SET status=$2, decided_at=now() WHERE id=$1 AND status='pending'",[r.rows[0].ref_ledger, m[2]==="approve"?"booked":"void"]);   // pembukuan: hanya catatan yang berubah
      else await db.query("UPDATE bots SET status='working',step=$2,updated_at=now() WHERE id=$1",[r.rows[0].bot_id,m[2]==="approve"?"disetujui, lanjut":"ditolak"]);
      return send(res,200,{ok:true,version:await bump()});
    }
    // bot polling keputusan persetujuannya
    const g = p.match(/^\/api\/approval\/(\d+)$/);
    if (req.method==="GET" && g){
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const r = await db.query("SELECT state FROM approvals WHERE id=$1 AND bot_id=$2",[g[1],bot.id]);
      return r.rowCount ? send(res,200,r.rows[0]) : send(res,404,{error:"tidak ada"});
    }
    // buat/ganti token bot — admin (token ditampilkan sekali)
    const t = p.match(/^\/api\/bots\/([\w-]+)\/token$/);
    if (req.method==="POST" && t){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const tok = "bot_"+crypto.randomBytes(24).toString("base64url");
      const r = await db.query("UPDATE bots SET token_hash=$2 WHERE id=$1",[t[1],sha(tok)]);
      return r.rowCount ? send(res,200,{bot:t[1],token:tok}) : send(res,404,{error:"bot tidak ada"});
    }
    // bot menyerahkan pekerjaan ke bot lain (hanya pasangan yang diizinkan); pengirim "berlari" ke ruang penerima
    if (req.method==="POST" && p==="/api/handoff"){
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const b = await body(req), to = String(b.to??""), ins = String(b.instruction??"").trim().slice(0,2000);
      if(!(HANDOFF[bot.id]||[]).includes(to)) return send(res,403,{error:"serah-terima ke bot itu tidak diizinkan"});
      if(!ins) return send(res,400,{error:"instruction kosong"});
      const rcv = await db.query("SELECT room_id FROM bots WHERE id=$1",[to]); if(!rcv.rowCount) return send(res,404,{error:"bot tujuan tidak ada"});
      const r = await db.query("INSERT INTO tasks(bot_id,instruction,from_bot) VALUES ($1,$2,$3) RETURNING id",[to,ins,bot.id]);
      await db.query("UPDATE bots SET visit_room=$2, visit_until=now() + interval '25 seconds' WHERE id=$1",[bot.id,rcv.rows[0].room_id]);
      return send(res,200,{ok:true,task_id:Number(r.rows[0].id),version:await bump()});
    }
    const pb = p.match(/^\/api\/tasks\/(\d+)\/public$/);
    if (req.method==="POST" && pb){                           // admin menandai satu tugas boleh dilihat tamu (atau menyembunyikannya lagi)
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const b = await body(req); const r = await db.query("UPDATE tasks SET is_public=$2 WHERE id=$1",[pb[1],!!b.public]);
      if (!r.rowCount) return send(res,404,{error:"tugas tidak ada"}); pubCache.t = 0;
      return send(res,200,{ok:true,version:await bump()});
    }
    const cn = p.match(/^\/api\/tasks\/(\d+)\/cancel$/);
    if (req.method==="POST" && cn){                           // admin membatalkan tugas yang masih antre (yang sudah berjalan tidak bisa dihentikan dari sini)
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const r = await db.query("UPDATE tasks SET state='cancelled', result='Dibatalkan oleh admin', finished_at=now() WHERE id=$1 AND state='queued'",[cn[1]]);
      if (!r.rowCount) return send(res,409,{error:"hanya tugas yang masih antre yang bisa dibatalkan (mungkin sudah diambil bot)"});
      pubCache.t = 0; return send(res,200,{ok:true,version:await bump()});
    }
    // ===== Pembukuan (Ledger): bot hanya MENGAJUKAN; masuk buku setelah admin menyetujui =====
    if (req.method==="POST" && p==="/api/ledger/propose"){
      const bot = await botFrom(req); if(!bot || bot.id!=="ledger-bot") return send(res,401,{error:"hanya bot Ledger"});
      const b = await body(req), errs = [];
      const kind = b.kind==="in"||b.kind==="out" ? b.kind : (errs.push("kind harus 'in' atau 'out'"), null);
      const amount = Number.isInteger(b.amount) && b.amount>0 && b.amount<=1e12 ? b.amount : (errs.push("amount harus bilangan bulat rupiah > 0"), null);
      const dOk = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && !isNaN(Date.parse(b.date)) && new Date(b.date+"T00:00:00Z").toISOString().startsWith(b.date);
      const dd = dOk ? (Date.parse(b.date)-Date.now())/864e5 : 0;
      const date = dOk && dd > -400 && dd < 31 ? b.date : (errs.push("date harus YYYY-MM-DD dan wajar (maks 400 hari lalu / 30 hari ke depan)"), null);
      const category = CATS.includes(b.category) ? b.category : (errs.push("category harus salah satu: "+CATS.join(", ")), null);
      if (errs.length) return send(res,400,{error:errs.join("; ")});
      const note = String(b.note??"").replace(/\s+/g," ").trim().slice(0,200);
      const e = await db.query("INSERT INTO ledger_entries(entry_date,kind,amount,category,note,proposed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",[date,kind,amount,category,note,bot.id]);
      const plan = `${kind==="out"?"PENGELUARAN":"PEMASUKAN"} ${rupiah(amount)}\nTanggal   : ${date}\nKategori  : ${category}\nKeterangan: ${note||"-"}`;
      const a = await db.query("INSERT INTO approvals(bot_id,action,detail,ref_ledger) VALUES ($1,$2,$3,$4) RETURNING id",[bot.id,`Catat ${kind==="out"?"pengeluaran":"pemasukan"} ${rupiah(amount)}`,JSON.stringify({plan}),e.rows[0].id]);
      return send(res,200,{ok:true,entry_id:Number(e.rows[0].id),approval_id:Number(a.rows[0].id),status:"menunggu persetujuan admin",version:await bump()});
    }
    if (req.method==="GET" && p==="/api/ledger/summary"){
      const bot = await botFrom(req);
      if(!(isAdmin(req) || (bot && bot.id==="ledger-bot"))) return send(res,401,{error:"butuh token admin atau bot Ledger"});
      let month = url.searchParams.get("month") || new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Jakarta"}).slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(month)) return send(res,400,{error:"month harus YYYY-MM"});
      const first = month+"-01";
      const [g,last,pend] = await Promise.all([
        db.query("SELECT kind, category, SUM(amount)::bigint AS total, count(*)::int AS n FROM ledger_entries WHERE status='booked' AND entry_date >= $1::date AND entry_date < ($1::date + interval '1 month') GROUP BY kind, category ORDER BY kind, total DESC",[first]),
        db.query("SELECT id, entry_date::text AS date, kind, amount::bigint AS amount, category, note FROM ledger_entries WHERE status='booked' AND entry_date >= $1::date AND entry_date < ($1::date + interval '1 month') ORDER BY entry_date DESC, id DESC LIMIT 10",[first]),
        db.query("SELECT count(*)::int AS n FROM ledger_entries WHERE status='pending'")]);
      const tot = (k) => g.rows.filter(r=>r.kind===k).reduce((a,r)=>a+Number(r.total),0);
      return send(res,200,{month, pemasukan_total:tot("in"), pengeluaran_total:tot("out"), selisih:tot("in")-tot("out"),
        per_kategori:g.rows.map(r=>({jenis:r.kind==="in"?"pemasukan":"pengeluaran",kategori:r.category,total:Number(r.total),jumlah_catatan:r.n})),
        catatan_terakhir:last.rows.map(r=>({...r,id:Number(r.id),amount:Number(r.amount)})), menunggu_persetujuan:pend.rows[0].n});
    }
    if (p==="/api/backup/status" && req.method==="GET"){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const l = await latestBackup();
      return send(res,200,{...l, ok: !!l.count && Date.now()-Date.parse(l.at) < 36*3600000 && !backupError, running: backupRunning, error: backupError, dir: BACKUP_DIR});
    }
    if (p==="/api/backup/run" && req.method==="POST"){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const r = await runBackup(); return send(res,r.ok?200:500,{...r, ...(await latestBackup())});
    }
    // daftar catatan buku untuk layar Pembukuan (khusus admin)
    if (p==="/api/ledger/entries" && req.method==="GET"){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const month = url.searchParams.get("month") || new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Jakarta"}).slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(month)) return send(res,400,{error:"month harus YYYY-MM"});
      const r = await db.query("SELECT id, entry_date::text AS date, kind, amount::bigint AS amount, category, note, status FROM ledger_entries WHERE entry_date >= $1::date AND entry_date < ($1::date + interval '1 month') ORDER BY entry_date DESC, id DESC LIMIT 500",[month+"-01"]);
      return send(res,200,{month, entries:r.rows.map(x=>({...x,id:Number(x.id),amount:Number(x.amount)}))});
    }
    if (p === "/api/routines" && req.method === "GET") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const r = await db.query("SELECT r.*, b.name AS bot FROM routines r JOIN bots b ON b.id=r.bot_id ORDER BY b.name, r.id");
      return send(res,200,{auto: await autoInfo(), routines: r.rows.map(x => ({ id:Number(x.id), bot_id:x.bot_id, bot:x.bot, name:x.name, instruction:x.instruction, every_minutes:x.every_minutes, enabled:x.enabled,
        window_start:x.window_start, window_end:x.window_end, last_run:x.last_run, next_run:x.next_run,
        est_tasks_per_day: Math.max(0, Math.min(24, (x.window_end - x.window_start) * 60 / x.every_minutes)) })) });
    }
    if (p === "/api/routines" && req.method === "POST") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const b = await body(req), name = String(b.name??"").trim().slice(0,60), ins = String(b.instruction??"").trim().slice(0,1500), every = Number(b.every_minutes);
      if (!name || !ins) return send(res,400,{error:"nama dan instruksi wajib diisi"});
      if (!Number.isInteger(every) || every < 60 || every > 10080) return send(res,400,{error:"interval 60 menit sampai 7 hari (10080 menit)"});
      if (INACTIVE_BOTS.has(b.bot)) return send(res,400,{error:"karyawan ini belum punya kemampuan kerja"});
      if (!(await db.query("SELECT 1 FROM bots WHERE id=$1",[b.bot])).rowCount) return send(res,404,{error:"bot tidak ada"});
      if ((await db.query("SELECT count(*)::int AS n FROM routines WHERE bot_id=$1",[b.bot])).rows[0].n >= 5) return send(res,400,{error:"maksimal 5 rutinitas per karyawan"});
      const r = await db.query("INSERT INTO routines(bot_id,name,instruction,every_minutes,enabled,next_run) VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 THEN now() + make_interval(mins => $4::int) END) RETURNING id",[b.bot,name,ins,every,!!b.enabled]);
      return send(res,200,{ok:true,id:Number(r.rows[0].id),version:await bump()});
    }
    const rt = p.match(/^\/api\/routines\/(\d+)\/(update|delete|run)$/);
    if (rt && req.method === "POST") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const id = rt[1], cur = (await db.query("SELECT * FROM routines WHERE id=$1",[id])).rows[0];
      if (!cur) return send(res,404,{error:"rutinitas tidak ada"});
      if (rt[2] === "delete") { await db.query("DELETE FROM routines WHERE id=$1",[id]); return send(res,200,{ok:true,version:await bump()}); }
      if (rt[2] === "run") { const r = await startRoutine(cur); if (!r.ok) return send(res,409,{error:r.error}); return send(res,200,{ok:true,task_id:r.task_id,version:await bump()}); }
      const b = await body(req), up = {};
      if (b.name !== undefined) up.name = String(b.name).trim().slice(0,60);
      if (b.instruction !== undefined) up.instruction = String(b.instruction).trim().slice(0,1500);
      if (b.every_minutes !== undefined) { const e = Number(b.every_minutes); if (!Number.isInteger(e) || e < 60 || e > 10080) return send(res,400,{error:"interval 60 menit sampai 7 hari"}); up.every_minutes = e; }
      for (const k of ["window_start","window_end"]) if (b[k] !== undefined) { const n = Number(b[k]); if (!Number.isInteger(n) || n < 0 || n > 24) return send(res,400,{error:k+" harus 0-24"}); up[k] = n; }
      if (up.name === "" || up.instruction === "") return send(res,400,{error:"nama dan instruksi tidak boleh kosong"});
      const sets = [], vals = [id]; for (const [k,v] of Object.entries(up)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      if (b.enabled !== undefined) { sets.push("enabled=" + (b.enabled ? "true" : "false")); sets.push("next_run=" + (b.enabled ? `now() + make_interval(mins => ${up.every_minutes ?? cur.every_minutes})` : "NULL")); }
      if (sets.length) await db.query(`UPDATE routines SET ${sets.join(", ")} WHERE id=$1`, vals);
      return send(res,200,{ok:true,version:await bump()});
    }
    if (p === "/api/auto" && req.method === "POST") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const b = await body(req);
      if (b.paused !== undefined) await setMeta("auto_paused", b.paused ? 1 : 0);
      if (b.daily_max !== undefined) { const n = Number(b.daily_max); if (!Number.isInteger(n) || n < 0 || n > 200) return send(res,400,{error:"daily_max 0-200"}); await setMeta("auto_daily_max", n); }
      autoCache.t = 0; return send(res,200,{ok:true,auto:await autoInfo(),version:await bump()});
    }
    const bs = p.match(/^\/api\/bots\/([\w-]+)\/stats$/);
    if (bs && req.method === "GET") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const st = await botStats(bs[1], true); return st ? send(res,200,st) : send(res,404,{error:"bot tidak ada"});
    }
    const sd = p.match(/^\/api\/bots\/([\w-]+)\/standing$/);
    if (sd && req.method === "POST") {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const b = await body(req), text = String(b.text??"").trim().slice(0,2000);
      const r = await db.query("UPDATE bots SET standing=$2 WHERE id=$1",[sd[1],text]);
      return r.rowCount ? send(res,200,{ok:true,version:await bump()}) : send(res,404,{error:"bot tidak ada"});
    }
    // ---- antrean tugas ----
    if (req.method==="POST" && p==="/api/tasks"){            // admin menambah tugas untuk bot
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const b = await body(req); const ins = String(b.instruction??"").trim().slice(0,2000);
      if(!ins) return send(res,400,{error:"instruction kosong"});
      let parent = null;                                     // lanjutan percakapan: bot bawaan = bot tugas sebelumnya
      if (b.parent_id != null) { parent = (await db.query("SELECT id,bot_id FROM tasks WHERE id=$1",[Number(b.parent_id)||0])).rows[0];
        if (!parent) return send(res,404,{error:"tugas sebelumnya tidak ada (mungkin sudah terhapus)"}); }
      const r = await db.query("INSERT INTO tasks(bot_id,instruction,parent_id) SELECT id,$2,$3 FROM bots WHERE id=$1 RETURNING id",[b.bot||parent?.bot_id,ins,parent?.id??null]);
      return r.rowCount ? send(res,200,{ok:true,task_id:Number(r.rows[0].id),version:await bump()}) : send(res,404,{error:"bot tidak ada"});
    }
    if (req.method==="GET" && p==="/api/tasks"){
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const r = await db.query("SELECT id,bot_id,instruction,state,result,created_at,finished_at,parent_id,stop_requested_at FROM tasks ORDER BY id DESC LIMIT 50");
      return send(res,200,{tasks:r.rows});
    }
    if (req.method==="POST" && p==="/api/tasks/claim"){      // bot mengambil tugas berikutnya
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const r = await db.query(`UPDATE tasks SET state='running',started_at=now() WHERE id=(
        SELECT id FROM tasks WHERE bot_id=$1 AND state='queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id,instruction,chat_session_id`,[bot.id]);
      if (!r.rows[0]) return send(res,200,{task:null});
      const id = Number(r.rows[0].id);
      await db.query("INSERT INTO task_logs(task_id,kind,text) VALUES ($1,'system',$2)",[id,`diambil oleh ${bot.name}`]);
      const cs = r.rows[0].chat_session_id ? (await db.query("SELECT id, claude_session FROM chat_sessions WHERE id=$1",[r.rows[0].chat_session_id])).rows[0] : null;
      return send(res,200,{task:{id,instruction:r.rows[0].instruction,standing:bot.standing||"",context:await taskContext(id),
        chat_session:cs?Number(cs.id):null, claude_session:cs?.claude_session||null}});
    }
    const f = p.match(/^\/api\/tasks\/(\d+)\/finish$/);
    if (req.method==="POST" && f){
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const b = await body(req);
      const r = await db.query("UPDATE tasks SET state=$3,result=$4,finished_at=now() WHERE id=$1 AND bot_id=$2 AND state='running'",
        [f[1],bot.id,["failed","stopped"].includes(b.state)?b.state:"done",String(b.result??"").slice(0,4000)]);
      if (r.rowCount && typeof b.session_id === "string" && /^[\w-]{8,80}$/.test(b.session_id))
        await db.query("UPDATE chat_sessions SET claude_session=$2, last_at=now() WHERE id=(SELECT chat_session_id FROM tasks WHERE id=$1)",[f[1],b.session_id]);
      return r.rowCount ? send(res,200,{ok:true,version:await bump()}) : send(res,404,{error:"tugas tidak ada / bukan running"});
    }
    // ---- kontrol tugas: log langkah, permintaan berhenti, detail + percakapan ----
    const lg = p.match(/^\/api\/tasks\/(\d+)\/(log|control)$/);
    if (req.method==="POST" && lg){                          // bot: tulis log langkah / cek apakah diminta berhenti
      const bot = await botFrom(req); if(!bot) return send(res,401,{error:"token bot salah"});
      const tk = (await db.query("SELECT state, stop_requested_at FROM tasks WHERE id=$1 AND bot_id=$2",[lg[1],bot.id])).rows[0];
      if (!tk) return send(res,404,{error:"tugas tidak ada"});
      const stop = !!tk.stop_requested_at || tk.state !== "running";
      if (lg[2] === "log") {
        const b = await body(req), text = String(b.text??"").trim().slice(0,2000), kind = ["step","tool","note"].includes(b.kind) ? b.kind : "step";
        const n = (await db.query("SELECT count(*)::int AS n FROM task_logs WHERE task_id=$1",[lg[1]])).rows[0].n;
        if (text && tk.state === "running" && n < 1000) await db.query("INSERT INTO task_logs(task_id,kind,text) VALUES ($1,$2,$3)",[lg[1],kind,text]);
      }
      return send(res,200,{ok:true,stop});
    }
    const st = p.match(/^\/api\/tasks\/(\d+)\/stop$/);
    if (req.method==="POST" && st){                          // admin: hentikan tugas (antre -> langsung dibatalkan; berjalan -> minta worker berhenti)
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const tk = (await db.query("SELECT state, stop_requested_at FROM tasks WHERE id=$1",[st[1]])).rows[0];
      if (!tk) return send(res,404,{error:"tugas tidak ada"});
      if (tk.state === "queued") {
        await db.query("UPDATE tasks SET state='cancelled', result='Dibatalkan oleh admin sebelum mulai', finished_at=now() WHERE id=$1 AND state='queued'",[st[1]]);
      } else if (tk.state === "running" && !tk.stop_requested_at) {
        await db.query("UPDATE tasks SET stop_requested_at=now() WHERE id=$1",[st[1]]);
        await db.query("INSERT INTO task_logs(task_id,kind,text) VALUES ($1,'system','admin meminta berhenti; menunggu worker')",[st[1]]);
      } else if (tk.state === "running" && Date.now() - Date.parse(tk.stop_requested_at) > 60000) {   // worker tidak merespons > 1 menit: tutup paksa di catatan
        await db.query("UPDATE tasks SET state='stopped', result=COALESCE(result,'')||'Dihentikan paksa: worker tidak merespons permintaan berhenti. Proses di server mungkin masih berjalan sampai batas waktunya.', finished_at=now() WHERE id=$1 AND state='running'",[st[1]]);
        await db.query("INSERT INTO task_logs(task_id,kind,text) VALUES ($1,'system','dihentikan paksa oleh admin')",[st[1]]);
      } else if (tk.state === "running") return send(res,202,{ok:true,state:"stopping",note:"permintaan berhenti sudah dikirim; tombol paksa tersedia setelah 1 menit"});
      else return send(res,409,{error:"tugas sudah selesai"});
      pubCache.t = 0; const now = (await db.query("SELECT state FROM tasks WHERE id=$1",[st[1]])).rows[0].state;
      return send(res,200,{ok:true,state:now==="running"?"stopping":now,version:await bump()});
    }
    const td = p.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method==="GET" && td){                           // admin: detail tugas + log (bertahap lewat ?after=) + rantai percakapan
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const t = (await db.query(`SELECT t.id,t.bot_id,b.name AS bot,b.room_id AS room,t.instruction,t.state,t.result,t.created_at,t.started_at,t.finished_at,t.parent_id,t.stop_requested_at,fb.name AS from_bot, ro.name AS routine
        FROM tasks t JOIN bots b ON b.id=t.bot_id LEFT JOIN bots fb ON fb.id=t.from_bot LEFT JOIN routines ro ON ro.id=t.routine_id WHERE t.id=$1`,[td[1]])).rows[0];
      if (!t) return send(res,404,{error:"tugas tidak ada"});
      const after = Number(url.searchParams.get("after")) || 0;
      const [logs, kids, chain] = await Promise.all([
        db.query("SELECT id,kind,text,at FROM task_logs WHERE task_id=$1 AND id>$2 ORDER BY id LIMIT 500",[td[1],after]),
        db.query("SELECT id,state FROM tasks WHERE parent_id=$1 ORDER BY id",[td[1]]),
        ancestors(td[1], 10)]);
      return send(res,200,{task:{...t,id:Number(t.id),parent_id:t.parent_id&&Number(t.parent_id)},
        logs:logs.rows.map(l=>({...l,id:Number(l.id)})), children:kids.rows.map(k=>({id:Number(k.id),state:k.state})),
        chain:chain.map(c=>({id:c.id,state:c.state,instruction:c.instruction,result:c.result}))});
    }
    // ---- chat langsung ke agent (satu percakapan berkelanjutan per sesi) ----
    const ch = p.match(/^\/api\/chat\/([\w-]+)(?:\/(send|new|stream|close))?$/);
    if (ch) {
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const botRow = (await db.query("SELECT id,name,role,room_id AS room,status,step,remote,last_seen FROM bots WHERE id=$1",[ch[1]])).rows[0];
      if (!botRow) return send(res,404,{error:"bot tidak ada"});
      if (INACTIVE_BOTS.has(botRow.id)) return send(res,400,{error:"karyawan ini belum punya kemampuan kerja"});
      const wanted = Number(url.searchParams.get("session")) || null;
      const current = async (create) => {
        let s = wanted ? (await db.query("SELECT * FROM chat_sessions WHERE id=$1 AND bot_id=$2",[wanted,botRow.id])).rows[0]
                       : (await db.query("SELECT * FROM chat_sessions WHERE bot_id=$1 AND NOT closed ORDER BY last_at DESC LIMIT 1",[botRow.id])).rows[0];
        if (!s && create) s = (await db.query("INSERT INTO chat_sessions(bot_id) VALUES ($1) RETURNING *",[botRow.id])).rows[0];
        return s;
      };
      if (req.method==="POST" && ch[2]==="new") {
        const s = (await db.query("INSERT INTO chat_sessions(bot_id) VALUES ($1) RETURNING id",[botRow.id])).rows[0];
        return send(res,200,{ok:true,session:Number(s.id)});
      }
      if (req.method==="POST" && ch[2]==="close") {             // sembunyikan percakapan dari daftar (riwayat tetap di database)
        const r = await db.query("UPDATE chat_sessions SET closed=true WHERE id=$1 AND bot_id=$2",[wanted,botRow.id]);
        return r.rowCount ? send(res,200,{ok:true}) : send(res,404,{error:"percakapan tidak ada"});
      }
      if (req.method==="POST" && ch[2]==="send") {
        const b = await body(req), text = String(b.text??"").trim().slice(0,4000);
        if (!text) return send(res,400,{error:"pesan kosong"});
        const s = await current(true);
        const last = (await db.query("SELECT id FROM tasks WHERE chat_session_id=$1 ORDER BY id DESC LIMIT 1",[s.id])).rows[0];
        const t = await db.query("INSERT INTO tasks(bot_id,instruction,parent_id,chat_session_id) VALUES ($1,$2,$3,$4) RETURNING id",[botRow.id,text,last?.id??null,s.id]);
        await db.query("UPDATE chat_sessions SET last_at=now(), title=CASE WHEN title='' THEN $2 ELSE title END WHERE id=$1",[s.id,text.slice(0,60)]);
        return send(res,200,{ok:true,session:Number(s.id),task_id:Number(t.rows[0].id),version:await bump()});
      }
      const s = await current(false);
      if (req.method==="GET" && !ch[2]) {                    // riwayat: sesi + pesan (tugas) + log masing-masing
        const sessions = (await db.query(`SELECT c.id,c.title,c.created_at,c.last_at, EXISTS(SELECT 1 FROM tasks t WHERE t.chat_session_id=c.id AND t.state IN ('queued','running')) AS busy
          FROM chat_sessions c WHERE c.bot_id=$1 AND NOT c.closed ORDER BY c.last_at DESC LIMIT 30`,[botRow.id])).rows.map(x=>({...x,id:Number(x.id)}));
        if (!s) return send(res,200,{bot:botRow,session:null,sessions,messages:[],last_log:0});
        const tk = (await db.query("SELECT id,instruction,state,result,created_at,started_at,finished_at,stop_requested_at FROM tasks WHERE chat_session_id=$1 ORDER BY id DESC LIMIT 60",[s.id])).rows.reverse();
        const ids = tk.map(t=>t.id);
        const logs = ids.length ? (await db.query("SELECT id,task_id,kind,text,at FROM task_logs WHERE task_id = ANY($1::bigint[]) ORDER BY id",[ids])).rows : [];
        return send(res,200,{bot:botRow,session:{id:Number(s.id),title:s.title,created_at:s.created_at,resumable:!!s.claude_session},sessions,
          messages:tk.map(t=>({...t,id:Number(t.id),logs:logs.filter(l=>l.task_id===t.id).map(l=>({id:Number(l.id),kind:l.kind,text:l.text,at:l.at}))})),
          last_log:logs.length?Number(logs.at(-1).id):0});
      }
      if (req.method==="GET" && ch[2]==="stream") {          // aliran langsung (NDJSON): log baru + perubahan status pesan, sampai 10 menit
        if (!s) return send(res,404,{error:"belum ada sesi"});
        res.writeHead(200,{"content-type":"application/x-ndjson","cache-control":"no-store","x-accel-buffering":"no"});
        let afterLog = Number(url.searchParams.get("after")) || 0, seen = new Map(), alive = true, botKey = "";
        req.on("close",()=>{ alive = false; });
        const until = Date.now() + 600000;
        while (alive && Date.now() < until) {
          const [tk, lg, bt] = await Promise.all([
            db.query("SELECT id,instruction,state,result,created_at,started_at,finished_at,stop_requested_at FROM tasks WHERE chat_session_id=$1 ORDER BY id DESC LIMIT 60",[s.id]),
            db.query("SELECT l.id,l.task_id,l.kind,l.text,l.at FROM task_logs l JOIN tasks t ON t.id=l.task_id WHERE t.chat_session_id=$1 AND l.id>$2 ORDER BY l.id LIMIT 300",[s.id,afterLog]),
            db.query("SELECT status,step,last_seen FROM bots WHERE id=$1",[botRow.id])]);
          const out = [];
          for (const t of tk.rows.reverse()) { const k = `${t.state}|${t.stop_requested_at}|${(t.result||"").length}`;
            if (seen.get(t.id) !== k) { seen.set(t.id,k); out.push({t:"msg",msg:{...t,id:Number(t.id)}}); } }
          for (const l of lg.rows) { out.push({t:"log",task_id:Number(l.task_id),log:{id:Number(l.id),kind:l.kind,text:l.text,at:l.at}}); afterLog = Number(l.id); }
          const bk = JSON.stringify(bt.rows[0]); if (bk !== botKey) { botKey = bk; out.push({t:"bot",bot:bt.rows[0]}); }
          out.push({t:"ping"});
          if (!res.write(out.map(o=>JSON.stringify(o)).join("\n")+"\n")) await new Promise(r=>res.once("drain",r));
          await new Promise(r=>setTimeout(r,700));
        }
        return res.end();
      }
      return send(res,405,{error:"metode tidak didukung"});
    }
    if (req.method==="GET" && p==="/api/board"){             // semua tugas+hasil untuk satu ruangan (5 hari terakhir)
      if(!isAdmin(req)) return send(res,401,{error:"butuh token admin"});
      const room = url.searchParams.get("room");
      const r = await db.query(`SELECT t.id,t.bot_id,b.name AS bot,b.room_id AS room,t.instruction,t.state,t.result,t.created_at,t.finished_at,t.is_public,t.parent_id,fb.name AS from_bot, ro.name AS routine
        FROM tasks t JOIN bots b ON b.id=t.bot_id LEFT JOIN bots fb ON fb.id=t.from_bot LEFT JOIN routines ro ON ro.id=t.routine_id WHERE t.created_at > now() - make_interval(days => $1)
        AND ($2::text IS NULL OR $2='lobby' OR b.room_id=$2) ORDER BY t.id DESC LIMIT 200`,[RET,room]);
      return send(res,200,{retention_days:RET,tasks:r.rows.map(x=>({...x,id:Number(x.id)}))});
    }
    send(res,404,{error:"tidak ditemukan"});
  }catch(e){ console.error(e.message); send(res,500,{error:"kesalahan server"}); }
}).listen(OFFICE_PORT,OFFICE_HOST,()=>console.log("office api di "+OFFICE_HOST+":"+OFFICE_PORT));
