// Loop agent generik: LLM (9router, hanya cx/) -> tool -> hasil -> ulangi sampai finish.
const { ROUTER_BASE_URL, ROUTER_API_KEY, ROUTER_MODEL } = process.env;
if (!ROUTER_MODEL?.startsWith("cx/")) throw new Error("Hanya model cx/ yang diizinkan");
const MAX_STEPS = 6, GAP_MS = 2000;                       // batas langkah & jeda antar panggilan AI
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const standingBlock = (s) => s && String(s).trim() ? `\n\nInstruksi tetap dari pemilik (ikuti selama tidak bertentangan dengan aturan keras di atas):\n${String(s).trim().slice(0, 2000)}` : "";
export async function runAgent({ def, instruction, report, standing, ctl }) {
  const tools = [...def.tools, {
    name: "finish", description: "Akhiri tugas dengan ringkasan hasil.",
    parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
  }];
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const messages = [{ role: "system", content: def.system + standingBlock(standing) }, { role: "user", content: instruction }];
  for (let step = 1; step <= MAX_STEPS; step++) {
    ctl?.check();
    const signal = ctl ? AbortSignal.any([AbortSignal.timeout(120000), ctl.signal]) : AbortSignal.timeout(120000);
    const res = await fetch(`${ROUTER_BASE_URL}/chat/completions`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ROUTER_API_KEY}` },
      body: JSON.stringify({ model: ROUTER_MODEL, stream: false, messages, tool_choice: "auto",
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
    const msg = JSON.parse(text).choices?.[0]?.message;
    if (!msg) throw new Error("AI membalas kosong");
    messages.push(msg);
    if (msg.content && msg.tool_calls?.length) await ctl?.log(msg.content, "note");
    if (!msg.tool_calls?.length) return msg.content || "(selesai tanpa ringkasan)";
    for (const call of msg.tool_calls) {
      const tool = byName[call.function.name]; let out, args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { out = { error: "argumen bukan JSON valid" }; }
      if (call.function.name === "finish") return String(args.summary ?? "");
      if (!tool) out = { error: "tool tidak dikenal" };
      else if (!out) { ctl?.check(); await report("working", `${tool.name} ${JSON.stringify(args)}`.slice(0, 80)); out = await tool.run(args, { def }); }   // report juga menulis log tugas
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
    await sleep(GAP_MS); ctl?.check();
  }
  return "Berhenti: melewati batas " + MAX_STEPS + " langkah.";
}
