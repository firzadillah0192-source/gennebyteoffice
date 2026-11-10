// Mesin "Claude Code" untuk bot: menjalankan `claude -p` dengan peran, folder kerja, dan daftar tool yang dibatasi.
import { spawn, execFile } from "node:child_process"; import { readFile, mkdir } from "node:fs/promises"; import path from "node:path"; import os from "node:os";
const HOME = os.homedir(), WORKTREES = process.env.OFFICE_WORKTREES || path.join(HOME, "office-work");
const DAILY_MAX = Number(process.env.OFFICE_CLAUDE_DAILY_MAX) || 10, TIMEOUT_MS = (Number(process.env.OFFICE_CLAUDE_TIMEOUT_MIN) || 10) * 60000;

// Selalu ditolak, apa pun peran botnya (lapisan tambahan di atas daftar tool yang diizinkan).
export const DENY = ["Read(**/.env*)", "Read(**/*.pem)", "Read(**/*.key)", "Read(**/id_rsa*)", "Read(**/id_ed25519*)", "Read(~/.ssh/**)", "Read(~/.claude/**)",
  "Edit(**/.env*)", "Write(**/.env*)", "Bash(rm:*)", "Bash(curl:*)", "Bash(wget:*)", "Bash(ssh:*)", "Bash(scp:*)", "Bash(sudo:*)", "Bash(cat:*)", "Bash(env:*)", "Bash(printenv:*)", "WebFetch", "WebSearch"];

// Antrean tunggal: hanya satu proses Claude pada satu waktu; batas jumlah per hari.
let chain = Promise.resolve(), day = "", runs = 0;
export function withClaudeSlot(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }
function countRun() { const d = new Date().toDateString(); if (d !== day) { day = d; runs = 0; } if (++runs > DAILY_MAX) throw new Error(`Batas harian Claude tercapai (${DAILY_MAX} proses/hari). Naikkan OFFICE_CLAUDE_DAILY_MAX bila perlu.`); }

// Samarkan nilai rahasia dari file .env yang dikenal + pola token umum, sebelum teks masuk papan/log.
export async function redact(text, extraDirs = []) {
  let out = String(text ?? "");
  for (const f of [path.join(HOME, "gennexbyteoffice", ".env"), path.join(process.cwd(), ".env"), ...extraDirs.map((d) => path.join(d, ".env"))]) {
    try { for (const line of (await readFile(f, "utf8")).split("\n")) {
      const m = line.match(/^([A-Z0-9_]*(KEY|TOKEN|SECRET|PASS|PASSWORD|DATABASE_URL)[A-Z0-9_]*)=(.+)$/i);
      if (m && m[3].trim().length >= 8) out = out.split(m[3].trim().replace(/^["']|["']$/g, "")).join("[disembunyikan]"); } } catch {}
  }
  return out.replace(/\b(sk|ghp|gho|xox[bap])[-_][A-Za-z0-9_-]{16,}/g, "[disembunyikan]").replace(/\bbot_[A-Za-z0-9_-]{20,}/g, "[disembunyikan]");
}

// Ringkas satu pemakaian tool Claude untuk log tugas (tanpa isi berkas yang ditulis).
function toolLine(name, input = {}) {
  const v = input.command ?? input.file_path ?? input.pattern ?? input.path ?? input.url ?? input.description ?? "";
  return `${name}${v ? " " + String(v).replace(/\s+/g, " ") : ""}`.slice(0, 400);
}

// onLog(text, kind) menerima langkah Claude secara live (stream-json); signal menghentikan proses bila admin menekan Hentikan.
export function runClaude({ cwd, system, prompt, tools, allow, deny = [], signal, onLog }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    try { countRun(); } catch (e) { return reject(e); }
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--append-system-prompt", system,
      "--tools", tools.join(","), "--disallowedTools", ...DENY, ...deny, "--allowedTools", ...allow];     // daftar variadik di akhir; prompt lewat stdin
    const env = { ...process.env, PATH: `${HOME}/.local/bin:${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
      GIT_AUTHOR_NAME: "Gennexbyte Office Bot", GIT_AUTHOR_EMAIL: "office-bot@gennexbyte.local", GIT_COMMITTER_NAME: "Gennexbyte Office Bot", GIT_COMMITTER_EMAIL: "office-bot@gennexbyte.local" };
    const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "", err = "", final = null, lastText = "", raw = "", ended = false;
    const finish = (fn, v) => { if (ended) return; ended = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); fn(v); };
    const line = (l) => {
      if (!l.trim()) return; let j; try { j = JSON.parse(l); } catch { raw += l + "\n"; return; }
      if (j.type === "result") { final = j; return; }
      if (j.type === "assistant") for (const c of j.message?.content ?? []) {
        if (c.type === "tool_use") onLog?.(toolLine(c.name, c.input), "tool");
        else if (c.type === "text" && c.text?.trim()) { lastText = c.text; onLog?.(c.text.trim().slice(0, 600), "note"); }
      }
    };
    child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    child.stderr.on("data", (d) => err += d);
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(reject, new Error(`Claude melewati batas waktu ${TIMEOUT_MS / 60000} menit`)); }, TIMEOUT_MS);
    const onAbort = () => { child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 5000).unref(); finish(reject, signal.reason); };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => finish(reject, e));
    child.on("close", (code) => { line(buf);
      if (final) { if (final.is_error) return finish(reject, new Error(String(final.result || "Claude error").slice(0, 300)));
        return finish(resolve, { text: String(final.result ?? lastText), cost: final.total_cost_usd, turns: final.num_turns }); }
      code === 0 && (lastText || raw.trim()) ? finish(resolve, { text: lastText || raw.trim() }) : finish(reject, new Error(`claude keluar kode ${code}: ${(err || raw).slice(0, 300)}`)); });
    child.stdin.end(prompt);
  });
}

const git = (cwd, args) => new Promise((res, rej) => execFile("git", ["-C", cwd, ...args], { env: { ...process.env, GIT_AUTHOR_NAME: "Gennexbyte Office Bot", GIT_AUTHOR_EMAIL: "office-bot@gennexbyte.local", GIT_COMMITTER_NAME: "Gennexbyte Office Bot", GIT_COMMITTER_EMAIL: "office-bot@gennexbyte.local" } },
  (e, so, se) => e ? rej(new Error((se || e.message).slice(0, 300))) : res(so.trim())));
export { git };

// Salinan kerja terpisah (git worktree) supaya folder produksi tidak tersentuh.
export async function makeWorktree(repo, taskId) {
  await git(repo, ["rev-parse", "--is-inside-work-tree"]);
  const dir = path.join(WORKTREES, `task-${taskId}`), branch = `office/task-${taskId}`, base = await git(repo, ["rev-parse", "HEAD"]);
  await mkdir(WORKTREES, { recursive: true });
  await git(repo, ["worktree", "add", "-b", branch, dir, base]);
  return { dir, branch, base };
}
