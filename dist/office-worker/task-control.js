// Kontrol satu tugas yang sedang dikerjakan: menulis log langkah ke Office dan mendengar permintaan berhenti dari web.
// Dipakai worker lokal dan worker remote. Office lama yang belum punya endpoint ini tetap jalan (log diabaikan, stop tidak pernah datang).
export class Stopped extends Error { constructor(msg = "Dihentikan oleh admin dari web.") { super(msg); this.name = "Stopped"; } }

export function makeControl({ call, token, taskId, redact = async (t) => t, pollMs = 4000 }) {
  const ac = new AbortController(); let closed = false, chain = Promise.resolve();   // log dikirim berurutan supaya urutannya sama dengan kejadian
  const markStop = (r) => { if (r?.stop && !ac.signal.aborted) ac.abort(new Stopped()); };
  const timer = setInterval(async () => { try { markStop(await call(`/api/tasks/${taskId}/control`, token)); } catch {} }, pollMs);
  timer.unref?.();
  return {
    signal: ac.signal,
    get stopped() { return ac.signal.aborted; },
    check() { if (ac.signal.aborted) throw new Stopped(); },
    log(text, kind = "step") {
      if (closed || !text) return chain;
      return chain = chain.then(async () => { try { markStop(await call(`/api/tasks/${taskId}/log`, token, { kind, text: (await redact(String(text))).slice(0, 2000) })); } catch {} });
    },
    close() { closed = true; clearInterval(timer); return chain; },
  };
}
