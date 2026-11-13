// 편집기 없이 서버에 붙어 AI 에게 한마디 하고 결과를 지켜본다.
//   node scripts/chat.mjs <projectId|new|demo> "<요청>"
const [target, text] = process.argv.slice(2);
const base = process.env.AGE_SERVER ?? "http://localhost:8787";
let id = target;
if (target === "new" || target === "demo") {
  const r = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template: target === "demo" ? "demo" : "blank" }) });
  id = (await r.json()).id;
}
console.log("project", id);
const ws = new WebSocket(`${base.replace("http", "ws")}/ws/${id}`);
const started = Date.now();
const t = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
let previews = 0;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.t === "init") {
    ws.send(JSON.stringify({ t: "chat", text, chips: [] }));
    // STOP_AFTER=초 를 주면 그때 멈춤을 눌러 본다
    if (process.env.STOP_AFTER) setTimeout(() => { console.log(t(), "STOP"); ws.send(JSON.stringify({ t: "stop" })); }, Number(process.env.STOP_AFTER) * 1000);
  }
  else if (m.t === "status" && m.text) console.log(t(), "·", m.text);
  else if (m.t === "preview") previews += m.commands.length;
  else if (m.t === "capture") ws.send(JSON.stringify({ t: "captured", req: m.req, data: null }));
  else if (m.t === "turn-commit") {
    const s = m.doc.scenes[m.doc.startScene];
    console.log(t(), "COMMIT", m.meta.label, `| ${previews} commands | scene ${s.w}x${s.h}, ${Object.keys(s.entities).length} entities, ${Object.keys(s.lights).length} lights, ${Object.keys(m.doc.assets).length} assets (${Object.values(m.doc.assets).filter((a) => !a.file).length} placeholder)`);
  } else if (m.t === "turn-discard") console.log(t(), "DISCARD");
  else if (m.t === "chat-entry" && m.entry.role === "assistant" && (m.entry.text || m.entry.error)) console.log(t(), "ASSISTANT:", m.entry.text, m.entry.error ? `\nERROR: ${m.entry.error}` : "", m.entry.card ? `\nCARD: ${JSON.stringify(m.entry.card)}` : "");
  else if (m.t === "busy" && !m.busy) setTimeout(() => process.exit(0), 300);
};
ws.onerror = (e) => { console.error("ws error", e.message); process.exit(1); };
