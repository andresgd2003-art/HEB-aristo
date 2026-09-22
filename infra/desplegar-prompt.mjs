// Despliega prompts/sistema.md al nodo Agente del flujo de chat y sincroniza PROMPT_VERSION
// (linea "Version: N" del prompt) en `Formatear response`, que la registra por turno en heb_turnos.
// Uso: node infra/desplegar-prompt.mjs
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const CHAT_ID = "ZpkluoNfIEbhI9K8";

const md = readFileSync("prompts/sistema.md", "utf8");
const version = (md.match(/^Version:\s*(\S+)/m) || [])[1];
if (!version) { console.error("prompts/sistema.md necesita una linea 'Version: N'"); process.exit(2); }
const prompt = md.replace(/^Version:.*\n/m, "").trim();

const w = await api("GET", "/workflows/" + CHAT_ID);
w.nodes.find((n) => n.name === "Agente").parameters.options.systemMessage = prompt;
const fr = w.nodes.find((n) => n.name === "Formatear response").parameters;
fr.jsCode = fr.jsCode.replace(/const PROMPT_VERSION = '[^']*';/, `const PROMPT_VERSION = '${version}';`);
const { timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow } = w.settings || {};
await api("PUT", "/workflows/" + CHAT_ID, { name: w.name, nodes: w.nodes, connections: w.connections,
  settings: JSON.parse(JSON.stringify({ timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow })) });
console.log(`Prompt v${version} desplegado (${prompt.length} caracteres).`);
