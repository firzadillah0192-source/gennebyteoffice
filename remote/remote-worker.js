// Worker remote: berjalan di VM platform (mis. NxBooth). Ia yang menghubungi Office (keluar), mengambil tugas Engineer, dan bekerja LOKAL.
import { makeFlow } from "./claude-flow.js"; import { makeControl, Stopped } from "./task-control.js"; import { redact } from "./claude-engine.js"; import { makeEngineer } from "./engineer-generic.js"; import { makeOperator } from "./operator.js"; import { git } from "./claude-engine.js";
const { OFFICE_URL, BOT_TOKEN, BOT_ID, PLATFORM, WORKDIR } = process.env;
for (const [k, v] of Object.entries({ OFFICE_URL, BOT_TOKEN, BOT_ID, PLATFORM, WORKDIR })) if (!v) { console.error(`.env belum lengkap: ${k} kosong`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, token, body) => { const r = await fetch(OFFICE_URL + path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body ?? {}) });
  if (r.status === 401) throw new Error("token ditolak Office (401): token dicabut atau salah"); return r.json(); };
const getJson = async (path, token) => (await fetch(OFFICE_URL + path, { headers: { Authorization: `Bearer ${token}` } })).json();
const { handleClaude } = makeFlow({ call, getJson });

// AGENT_KIND=operator: asisten serba bisa untuk seluruh VM (chat langsung dari web); bawaan: engineer satu platform.
const KIND = (process.env.AGENT_KIND || "engineer").toLowerCase();
const def = KIND === "operator" ? makeOperator({ id: BOT_ID, vm: PLATFORM, cwd: WORKDIR }) : makeEngineer({ id: BOT_ID, platform: PLATFORM, cwd: WORKDIR }); def.token = BOT_TOKEN;
if (!def.inPlace) try { await git(WORKDIR, ["rev-parse", "--is-inside-work-tree"]); }
catch { def.canWrite = false; console.warn(`PERINGATAN: ${WORKDIR} bukan repositori git, jadi hanya penyelidikan (baca-saja) yang diizinkan; perubahan kode dinonaktifkan.`); }
const report = (status, step) => call("/api/event", def.token, { status, step });

async function handle(task) {
  console.log(`tugas #${task.id}: ${task.instruction}`);
  const ctl = makeControl({ call, token: def.token, taskId: task.id, redact: (t) => redact(t, [WORKDIR]) });
  const say = (status, step) => { if (status === "working") ctl.log(step); return report(status, step); };
  const remembers = def.engine === "claude" && task.claude_session;              // sesi Claude dilanjutkan: riwayat sudah diingat
  task.prompt = task.context && !remembers ? `${task.context}\n\nPesan baru dari pemilik: ${task.instruction}` : task.instruction;
  await say("working", "mulai: " + task.instruction.slice(0, 60));
  try {
    const result = await handleClaude(def, task, say, ctl);
    await ctl.close(); await call(`/api/tasks/${task.id}/finish`, def.token, { state: "done", result, session_id: task.claude_session_out });
    await report("done", result.replace(/\s+/g, " ").slice(0, 80));
  } catch (e) {
    await ctl.close();
    if (e instanceof Stopped || e?.name === "Stopped") { await call(`/api/tasks/${task.id}/finish`, def.token, { state: "stopped", result: e.message, session_id: task.claude_session_out }); await report("idle", "dihentikan admin"); }
    else { await call(`/api/tasks/${task.id}/finish`, def.token, { state: "failed", result: e.message, session_id: task.claude_session_out }); await report("error", e.message.slice(0, 80)); }
  }
  await sleep(3000); await report("idle", "menunggu tugas");
}
console.log(`worker remote ${BOT_ID} (${PLATFORM}) -> ${OFFICE_URL}, folder kerja ${WORKDIR}, ubah-kode ${def.canWrite ? "ya (lewat persetujuan)" : "tidak"}`);
let announced = false;
while (true) {
  try {
    if (!announced) { await report("idle", "siap menerima tugas"); announced = true; }
    const { task } = await call("/api/tasks/claim", def.token);
    if (!task) { await sleep(5000); continue; }
    await handle(task);
  } catch (e) { console.error("jalur error:", e.message); announced = false; await sleep(15000); }
}
