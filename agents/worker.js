// Worker: tiap karyawan punya jalur sendiri (tidak saling menunggu). Mesin per bot: "router" (9router cx/) atau "claude" (Claude Code).
import { runAgent } from "./loop.js"; import { ops, opsUrls, infraSnapshot } from "./ops.js"; import { ideator } from "./ideator.js";
import { receptionist } from "./receptionist.js"; import { ledger } from "./ledger.js"; import { posty } from "./posty.js"; import { engineer } from "./engineer.js"; import { operator } from "./operator.js";
import { makeFlow } from "./claude-flow.js"; import { makeControl, Stopped } from "./task-control.js"; import { redact } from "./claude-engine.js";

const API = `http://127.0.0.1:${process.env.OFFICE_PORT || 4100}`, ADMIN = process.env.OFFICE_ADMIN_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, token, body) => (await fetch(API + path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body ?? {}) })).json();
const getJson = async (path, token) => (await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } })).json();

const { handleClaude } = makeFlow({ call, getJson });

// Karyawan yang belum punya tool kerja: menolak tugas dengan jelas (tanpa panggilan AI) supaya tidak mengantre selamanya.
const stubs = ["clipper-bot"].map((id) => ({ id, tools: [], stub: true }));
const defs = [ops, ideator, receptionist, engineer, operator, ledger, posty, ...stubs];

for (const def of defs) {                                  // token bot dibuat ulang tiap worker start, hanya di memori
  def.token = (await call(`/api/bots/${def.id}/token`, ADMIN)).token;
  if (!def.token) throw new Error("gagal membuat token untuk " + def.id);
  await call("/api/event", def.token, { status: "idle", step: def.stub ? (def.note ? "belum aktif (butuh worker di VM-nya)" : "belum diaktifkan (belum ada tool kerja)") : "siap menerima tugas" });
}

// ---- Patroli otomatis Ops: tanpa perintah dan TANPA panggilan AI selama semuanya sehat ----
const WATCH_MS = Math.max(1, Number(process.env.OPS_WATCH_MINUTES) || 180) * 60000;
const health = new Map(); let lastSummary = "", lastPost = 0;
async function patrol() {
  const probe = ops.tools.find((t) => t.name === "check_url");
  const bad = [], down = [], back = [];
  for (const url of opsUrls) {
    const r = await probe.run({ url }); const ok = !r.error && (r.final_status ?? 599) < 400;
    const prev = health.get(url); health.set(url, ok);
    if (!ok) bad.push(url);
    if (prev === true && !ok) down.push({ url, r });
    if (prev === false && ok) back.push(url);
  }
  const host = (u) => new URL(u).host;
  const summary = bad.length ? `${bad.length}/${opsUrls.length} platform bermasalah: ${bad.map(host).join(", ")}` : `patroli: ${opsUrls.length}/${opsUrls.length} platform hidup`;
  if (!ops.busy && (summary !== lastSummary || Date.now() - lastPost > 3600000)) {
    lastSummary = summary; lastPost = Date.now();
    await call("/api/event", ops.token, { status: bad.length ? "error" : "idle", step: summary.slice(0, 80) });
  }
  for (const u of back) console.log("pulih:", u);
  for (const { url, r } of down) {                           // inisiatif sendiri: buka tugas penyelidikan untuk Engineer (baca-saja; perubahan tetap lewat persetujuan)
    const t = await infraSnapshot("tunnel", 15), k = await infraSnapshot("kontainer");          // potret kondisi server (baca-saja), bila alatnya sudah dipasang
    const infra = t.error ? `Kondisi server tidak tersedia: ${t.error}` : `Kondisi server saat patroli:\n[tunnel]\n${t.keluaran}\n[kontainer]\n${k.keluaran || k.error}`;
    await call("/api/tasks", ADMIN, { bot: "engineer-socialhub", instruction: `[Otomatis dari Ops] Patroli menemukan ${url} bermasalah: ${JSON.stringify(r)}.\n${infra}\nSelidiki kemungkinan penyebab dari kode/riwayat git dan data di atas, lalu sarankan langkah berikutnya.` });
    console.log("tugas penyelidikan dibuka untuk", url);
  }
}
(async () => { await sleep(15000); while (true) { await patrol().catch((e) => console.error("patroli gagal:", e.message)); await sleep(WATCH_MS); } })();

// ---- Satu jalur per bot ----
async function handle(def, task) {
  const ctl = makeControl({ call, token: def.token, taskId: task.id, redact: (t) => redact(t, def.cwd ? [def.cwd] : []) });
  const report = (status, step) => { if (status === "working") ctl.log(step); return call("/api/event", def.token, { status, step }); };
  task.prompt = task.context ? `${task.context}\n\nPesan baru dari pemilik: ${task.instruction}` : task.instruction;
  if (def.stub) {
    await call(`/api/tasks/${task.id}/finish`, def.token, { state: "failed", result: def.note || "Belum diaktifkan: karyawan ini belum punya kemampuan kerja (tool). Minta admin membangunnya dulu; tugas ini tidak dijalankan." });
    ctl.close(); console.log(`[${def.id}] tugas #${task.id} ditolak (belum aktif)`); return;
  }
  console.log(`[${def.id}] tugas #${task.id}: ${task.instruction}`);
  def.busy = true; await report("working", "mulai: " + task.instruction.slice(0, 60));
  try {
    const result = def.engine === "claude" ? await handleClaude(def, task, report, ctl) : await runAgent({ def, instruction: task.prompt, report, standing: task.standing, ctl });
    await ctl.close(); await call(`/api/tasks/${task.id}/finish`, def.token, { state: "done", result });
    await report("done", result.replace(/\s+/g, " ").slice(0, 80));
  } catch (e) {
    await ctl.close();
    if (e instanceof Stopped || e?.name === "Stopped") { await call(`/api/tasks/${task.id}/finish`, def.token, { state: "stopped", result: e.message }); await report("idle", "dihentikan admin"); }
    else { await call(`/api/tasks/${task.id}/finish`, def.token, { state: "failed", result: e.message }); await report("error", e.message.slice(0, 80)); }
  }
  await sleep(3000); def.busy = false; await report("idle", "menunggu tugas");
}
async function botLoop(def) {
  while (true) {
    try { const { task } = await call("/api/tasks/claim", def.token); if (!task) { await sleep(5000); continue; } await handle(def, task); }
    catch (e) { console.error(`[${def.id}] jalur error:`, e.message); await sleep(10000); }
  }
}
console.log("worker siap:", defs.map((d) => d.id).join(", "));
defs.forEach((d) => botLoop(d));
