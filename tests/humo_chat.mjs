// Prueba de humo del chat: tres turnos encadenados (cifra, seguimiento con memoria, politica).
// Uso: node tests/humo_chat.mjs
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const URL = env.N8N_BASE_URL + (process.env.CHAT_PATH || "/webhook/heb-aristo/chat");
let prev = null;
for (const input of process.argv.slice(2).length ? process.argv.slice(2) : [
  "¿Cuánto vendió la tienda T02 en julio?", "¿Y en agosto?", "¿Cuántos días tiene un cliente para devolver una licuadora?"]) {
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, previous_response_id: prev }) });
  const j = await r.json().catch(() => ({}));
  prev = j.response_id;
  console.log(`[${r.status} ${Date.now() - t0} ms] ${input}\n   -> ${(j.respuesta || JSON.stringify(j)).slice(0, 600)}\n`);
}
