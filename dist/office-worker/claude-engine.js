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

export function runClaude({ cwd, system, prompt, tools, allow, deny = [] }) {
  return new Promise((resolve, reject) => {
    try { countRun(); } catch (e) { return reject(e); }
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--append-system-prompt", system,
      "--tools", tools.join(","), "--disallowedTools", ...DENY, ...deny, "--allowedTools", ...allow];     // daftar variadik di akhir; prompt lewat stdin
    const env = { ...process.env, PATH: `${HOME}/.local/bin:${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
      GIT_AUTHOR_NAME: "Gennexbyte Office Bot", GIT_AUTHOR_EMAIL: "office-bot@gennexbyte.local", GIT_COMMITTER_NAME: "Gennexbyte Office Bot", GIT_COMMITTER_EMAIL: "office-bot@gennexbyte.local" };
    const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = ""; child.stdout.on("data", (d) => out += d); child.stderr.on("data", (d) => err += d);
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Claude melewati batas waktu ${TIMEOUT_MS / 60000} menit`)); }, TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer);
      try { const j = JSON.parse(out); if (j.is_error) return reject(new Error(String(j.result || "Claude error").slice(0, 300)));
        resolve({ text: String(j.result ?? ""), cost: j.total_cost_usd, turns: j.num_turns });
      } catch { code === 0 && out.trim() ? resolve({ text: out.trim() }) : reject(new Error(`claude keluar kode ${code}: ${(err || out).slice(0, 300)}`)); } });
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
