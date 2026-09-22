// Clona "HEB-aristo — Ingesta del corpus" a "HEB-aristo — Ingesta (TEST)": mismo flujo, con el troceador de
// infra/trocear_contexto.js (el local, el que se quiere probar) y la tabla heb_aristo_corpus_test. Asi se reindexa y se
// mide en TEST sin tocar el corpus de produccion. Idempotente.
// Uso: node infra/clonar-ingesta-test.mjs            -> crea/actualiza el flujo e imprime la URL del webhook
//      node infra/clonar-ingesta-test.mjs --borrar
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const NAME = "HEB-aristo — Ingesta (TEST)", TABLA = "heb_aristo_corpus_test";
const lista = (await api("GET", "/workflows?limit=250")).data;
const test = lista.find((w) => w.name === NAME);
if (process.argv[2] === "--borrar") { if (test) { await api("DELETE", "/workflows/" + test.id); console.log("Borrado " + NAME); } process.exit(0); }
const prod = await api("GET", "/workflows/" + lista.find((w) => w.name === "HEB-aristo — Ingesta del corpus").id);
const troceador = readFileSync("infra/trocear_contexto.js", "utf8");
let path = "";
const nodes = prod.nodes.map((n) => {
  n = JSON.parse(JSON.stringify(n));
  if (n.type === "n8n-nodes-base.webhook") { n.parameters.path = n.parameters.path.replace("heb-aristo/", "heb-aristo/test/"); n.webhookId = "heb-aristo-test-" + n.webhookId; path = n.parameters.path; }
  if (n.name === "Trocear con contexto") n.parameters.jsCode = troceador;
  if (n.parameters?.query) n.parameters.query = n.parameters.query.split("heb_aristo_corpus").join(TABLA);
  if (n.parameters?.tableName === "heb_aristo_corpus") n.parameters.tableName = TABLA;
  return n;
});
const body = { name: NAME, nodes, connections: prod.connections, settings: prod.settings };
const w = test ? await api("PUT", "/workflows/" + test.id, body) : await api("POST", "/workflows", body);
if (!w.active) await api("POST", "/workflows/" + w.id + "/activate");
console.log(`${test ? "Actualizado" : "Creado"} ${NAME} id=${w.id} | tabla ${TABLA} -> ${API}/webhook/${path.replace(/\/ingesta$/, "")}`);
