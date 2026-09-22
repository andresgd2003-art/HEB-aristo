// Crea o actualiza los DOS flujos de HEB-aristo en n8n desde workflows/*.json y los sincroniza con las fuentes
// versionadas (prompt, esquema, ejemplos, guarda). Idempotente: se puede correr las veces que haga falta.
//
//   node infra/crear-flujos.mjs        importa workflows/heb-aristo-{ingesta,chat}.json (crea por nombre o actualiza),
//                                      activa ambos, y luego corre consolidar_sql.mjs (esquema+ejemplos+guarda -> Agente SQL)
//                                      y desplegar-prompt.mjs (prompts/sistema.md -> Agente).
// Requiere en .env: N8N_BASE_URL, N8N_API_KEY, HEB_CRED_ID (credencial Postgres de solo lectura) y que existan en n8n las
// credenciales "OpenAi account", "BANO Postgres (pgvector)" y "BANO ingesta (header auth)" con los ids de los JSON
// (o edita los ids en workflows/*.json antes de importar).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, "") + "/api/v1", H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const lista = (await api("GET", "/workflows?limit=250")).data;
for (const k of ["ingesta", "chat"]) {
  const cuerpo = JSON.parse(readFileSync(`workflows/heb-aristo-${k}.json`, "utf8"));
  const ya = lista.find((w) => w.name === cuerpo.name);
  const w = ya ? await api("PUT", "/workflows/" + ya.id, cuerpo) : await api("POST", "/workflows", cuerpo);
  await api("POST", "/workflows/" + w.id + "/activate").catch((e) => { if (!/already|active/i.test(e.message)) throw e; });
  console.log((ya ? "Actualizado " : "Creado ") + w.name + " id=" + w.id + " (" + w.nodes.length + " nodos)");
  if (k === "chat" && w.id !== "ZpkluoNfIEbhI9K8") console.log("  AVISO: el id del chat cambio; actualiza CHAT_ID en infra/consolidar_sql.mjs, infra/desplegar-prompt.mjs, infra/costo.mjs y tests/ragas/*.py");
}
for (const s of ["infra/consolidar_sql.mjs", "infra/desplegar-prompt.mjs"]) { console.log("-> " + s); execFileSync("node", [s], { stdio: "inherit" }); }
