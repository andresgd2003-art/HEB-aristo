// Clona el chat de produccion a "HEB-aristo — Chat (TEST)" (webhook /heb-aristo/test/chat) para medir un cambio ANTES de
// promoverlo: prompt de prompts/sistema.md (el local, no el desplegado) y contextWindowLength a elegir. Mismas herramientas,
// misma memoria (heb_turnos) y credenciales. Idempotente. Las pruebas apuntan al TEST con CHAT_PATH=/webhook/heb-aristo/test/chat.
// Uso: node infra/clonar-test.mjs [ventana=20]   |   node infra/clonar-test.mjs --borrar
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const NAME = "HEB-aristo — Chat (TEST)";
const lista = (await api("GET", "/workflows?limit=250")).data;
const test = lista.find((w) => w.name === NAME);
if (process.argv[2] === "--borrar") { if (test) { await api("DELETE", "/workflows/" + test.id); console.log("Borrado " + NAME); } else console.log("No existe " + NAME); process.exit(0); }
const VENTANA = Number(process.argv[2] || 20);
const TABLA = env.CORPUS_TABLE || "heb_aristo_corpus"; // CORPUS_TABLE=heb_aristo_corpus_test para probar una reindexacion
const prod = await api("GET", "/workflows/" + lista.find((w) => w.name === "HEB-aristo — Chat").id);
const prompt = readFileSync("prompts/sistema.md", "utf8");
const nodes = prod.nodes.map((n) => {
  n = JSON.parse(JSON.stringify(n));
  if (n.type === "n8n-nodes-base.webhook") { n.parameters.path = "heb-aristo/test/chat"; n.webhookId = "heb-aristo-test-chat"; }
  if (n.type === "@n8n/n8n-nodes-langchain.memoryBufferWindow") n.parameters.contextWindowLength = VENTANA;
  if (n.type === "@n8n/n8n-nodes-langchain.agent" && n.parameters?.options?.systemMessage) n.parameters.options.systemMessage = prompt;
  if (n.parameters?.tableName === "heb_aristo_corpus") n.parameters.tableName = TABLA;
  // FALLBACK_MODEL=deepseek-ai/deepseek-v4.1-flash cambia el modelo de los nodos de respaldo (NVIDIA) para medir otro candidato.
  if (env.FALLBACK_MODEL && /respaldo \(NVIDIA\)/.test(n.name)) n.parameters.model = { __rl: true, mode: "id", value: env.FALLBACK_MODEL };
  return n;
});
const body = { name: NAME, nodes, connections: prod.connections, settings: prod.settings };
const w = test ? await api("PUT", "/workflows/" + test.id, body) : await api("POST", "/workflows", body);
if (!w.active) await api("POST", "/workflows/" + w.id + "/activate");
const v = (prompt.match(/^Version:\s*(\d+)/m) || [])[1];
console.log(`${test ? "Actualizado" : "Creado"} ${NAME} id=${w.id} | prompt v${v} | contextWindowLength=${VENTANA} | corpus ${TABLA}${env.FALLBACK_MODEL ? " | respaldo " + env.FALLBACK_MODEL : ""} -> ${API}/webhook/heb-aristo/test/chat`);
