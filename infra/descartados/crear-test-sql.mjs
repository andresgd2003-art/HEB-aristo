// Flujo de TEST: webhook -> Execute Workflow (Consultas SQL) -> respuesta. Sirve para medir el
// agente hijo sin pasar por el agente de chat. Uso: node infra/crear-test-sql.mjs
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j; };
const lista = (await api("GET", "/workflows?limit=250")).data;
const hijo = lista.find((w) => w.name === "HEB-aristo — Consultas SQL");
const NOMBRE = "HEB-aristo — TEST consultar_datos";
const cuerpo = { name: NOMBRE, settings: { executionOrder: "v1" }, nodes: [
  { id: "w", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "heb-aristo-test-sql",
    parameters: { httpMethod: "POST", path: "heb-aristo/test/sql", responseMode: "lastNode", options: {} } },
  { id: "x", name: "Consultas SQL", type: "n8n-nodes-base.executeWorkflow", typeVersion: 1.2, position: [260, 0],
    parameters: { workflowId: { __rl: true, mode: "id", value: hijo.id }, workflowInputs: { mappingMode: "defineBelow", value: { pregunta: "={{ $json.body.pregunta }}" }, matchingColumns: ["pregunta"], schema: [{ id: "pregunta", displayName: "pregunta", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] }, options: {} } },
], connections: { Webhook: { main: [[{ node: "Consultas SQL", type: "main", index: 0 }]] } } };
const ya = lista.find((w) => w.name === NOMBRE);
const t = ya ? await api("PUT", "/workflows/" + ya.id, cuerpo) : await api("POST", "/workflows", cuerpo);
await api("POST", "/workflows/" + t.id + "/activate");
console.log("TEST listo:", t.id, API + "/webhook/heb-aristo/test/sql");
