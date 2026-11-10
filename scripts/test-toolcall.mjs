// Uji SATU panggilan tool calling ke 9router (model cx/ saja). Jalankan: node --env-file=.env scripts/test-toolcall.mjs
const { ROUTER_BASE_URL, ROUTER_API_KEY, ROUTER_MODEL } = process.env;
if (!ROUTER_API_KEY) { console.error("ROUTER_API_KEY kosong di .env"); process.exit(1); }
if (!ROUTER_MODEL?.startsWith("cx/")) { console.error("Hanya model cx/ yang diizinkan"); process.exit(1); }
const res = await fetch(`${ROUTER_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ROUTER_API_KEY}` },
  body: JSON.stringify({
    model: ROUTER_MODEL, stream: false,
    messages: [{ role: "user", content: "Laporkan status: kamu mulai mengerjakan tugas 'cek uptime nxbooth'." }],
    tools: [{ type: "function", function: {
      name: "report_status",
      description: "Laporkan status kerja ke dashboard kantor",
      parameters: { type: "object", properties: {
        status: { type: "string", enum: ["working","idle","waiting_user","error","done"] },
        step: { type: "string", maxLength: 80 } }, required: ["status","step"] } } }],
    tool_choice: "auto",
  }),
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 1500));
