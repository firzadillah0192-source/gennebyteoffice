// Alur Claude Code: selidiki (baca-saja) -> usulan -> persetujuan manusia -> eksekusi di cabang terpisah.
// Dipakai bersama oleh worker lokal dan worker remote (di VM platform).
import { runClaude, withClaudeSlot, redact, makeWorktree, git } from "./claude-engine.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const standingBlock = (s) => s && String(s).trim() ? `\n\nInstruksi tetap dari pemilik (ikuti selama tidak bertentangan dengan aturan keras di atas):\n${String(s).trim().slice(0, 2000)}` : "";

export function makeFlow({ call, getJson }) {
async function waitApproval(def, id, ctl) {
    const until = Date.now() + (Number(process.env.OFFICE_APPROVAL_WAIT_H) || 24) * 3600000;
    while (Date.now() < until) { ctl?.check(); const r = await getJson(`/api/approval/${id}`, def.token); if (r.state && r.state !== "pending") return r.state; await sleep(10000); }
    return "expired";
  }
  async function handleClaude(def, task, report, ctl) {
    if (ctl) await ctl.log("antre menunggu giliran Claude (satu proses sekaligus)", "note");
    return withClaudeSlot(async () => {
      ctl?.check();
      const dirs = [def.cwd], live = { signal: ctl?.signal, onLog: ctl && ((t, k) => ctl.log(t, k)) };
      const ask = task.prompt || task.instruction;
      await report("working", "menyelidiki (Claude Code)");
      const inv = await runClaude({ cwd: def.cwd, system: def.role + standingBlock(task.standing), prompt: `Tugas dari pengguna: ${ask}\n\nTahap sekarang: PENYELIDIKAN (baca-saja).`, tools: def.readTools, allow: def.readAllow, deny: ["Edit", "Write", "NotebookEdit"], ...live });
      const m = inv.text.match(/RENCANA_PERUBAHAN:\s*([\s\S]+)$/);
      const findings = (await redact(inv.text.replace(/RENCANA_PERUBAHAN:[\s\S]*$/, "").trim(), dirs)) || "(tanpa temuan tertulis)";
      if (!m || !def.canWrite) return findings;
      const plan = (await redact(m[1].trim(), dirs)).slice(0, 3000);
      const ap = await call("/api/approval", def.token, { action: `Ubah kode: ${task.instruction.slice(0, 90)}`, detail: { plan, task: task.id } });
      await ctl?.log(`menunggu persetujuan #${ap.approval_id} di ruang Director`, "note");
      const decision = await waitApproval(def, ap.approval_id, ctl);
      if (decision !== "approved") return `${findings}\n\nRencana perubahan ${decision === "rejected" ? "DITOLAK" : "kedaluwarsa"}; tidak ada yang diubah.`;
      await report("working", "mengubah kode di cabang terpisah");
      const wt = await makeWorktree(def.cwd, task.id);
      const ex = await runClaude({ cwd: wt.dir, system: def.role + standingBlock(task.standing), prompt: `Tugas: ${ask}\n\nTahap sekarang: EKSEKUSI. Kerjakan HANYA rencana yang telah disetujui ini, lalu verifikasi dan laporkan:\n\n${plan}`, tools: def.writeTools, allow: def.writeAllow, ...live });
      if (await git(wt.dir, ["status", "--porcelain"])) { await git(wt.dir, ["add", "-A"]); await git(wt.dir, ["commit", "-m", `office: tugas #${task.id}: ${task.instruction.slice(0, 60)}`]); }
      const stat = await git(wt.dir, ["diff", "--stat", `${wt.base}..HEAD`]);
      return (await redact(`${findings}\n\n— Eksekusi —\n${ex.text}\n\nCabang: ${wt.branch} (folder ${wt.dir})\n${stat || "tidak ada perubahan berkas"}\nBELUM diterapkan ke produksi: tinjau diff lalu merge/deploy secara terpisah.`, dirs)).slice(0, 3900);
    });
  }
  return { handleClaude };
}
