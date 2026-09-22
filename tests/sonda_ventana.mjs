// Sonda de la ventana de memoria: N turnos triviales ("apunta el código Kx") y al final "¿qué códigos te di?".
// Sin SQL ni políticas: mide SOLO cuántos turnos previos ve el agente. n8n pasa contextWindowLength como k a
// LangChain BufferWindowMemory, que hace messages.slice(-k*2): k=10 deberían ser 10 turnos. Aquí se comprueba.
// Uso: node tests/sonda_ventana.mjs [turnos=12]
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const URL = env.N8N_BASE_URL + "/webhook/heb-aristo/chat", N = Number(process.argv[2] || 12);
const pide = async (input, prev) => { const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prev ? { input, previous_response_id: prev } : { input }) }); return r.json().catch(() => ({})); };
let prev = ""; const codigos = [];
for (let i = 1; i <= N; i++) {
  const c = "K" + i + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); codigos.push(c);
  const j = await pide(`Apunta este código de referencia y confírmalo en una palabra: ${c}`, prev); prev = j.response_id || prev;
  process.stdout.write(`T${i} ${c} -> ${String(j.respuesta ?? "").slice(0, 40).replace(/\n/g, " ")}\n`);
}
const j = await pide("Lista todos los códigos de referencia que te he dado en esta conversación, en orden, uno por línea. Solo los códigos.", prev);
const vistos = codigos.filter((c) => String(j.respuesta ?? "").includes(c));
console.log("\nRespuesta final:\n" + j.respuesta + "\n");
console.log(`Ventana observada: recuerda ${vistos.length} de ${N} códigos -> ${vistos.join(", ")}`);
console.log(`Primero recordado: ${vistos[0] ?? "ninguno"} (turno ${codigos.indexOf(vistos[0]) + 1})`);
