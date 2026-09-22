// Sincroniza el agente SQL dentro del flujo de chat (Recuperación) con las fuentes versionadas:
//   Agente ─ai_tool─ consultar_datos (AI Agent Tool: reglas_sql.md + esquema_para_el_agente.md + ejemplos_sql.md)
//          ─ai_tool─ ejecutar_sql (Postgres como herramienta, credencial heb_lector, con guarda_sql.js como expresión)
//   Modelo SQL ─ai_languageModel─ consultar_datos
// Idempotente: reemplaza los tres nodos y sus conexiones. Lo llama infra/crear-flujos.mjs.
//
// Uso: node infra/consolidar_sql.mjs
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 400)); return j; };
const CHAT_ID = "ZpkluoNfIEbhI9K8";
const OPENAI = { openAiApi: { id: "khGoYB8EqlxK66fW", name: "OpenAi account" } };
const CRED = { postgres: { id: env.HEB_CRED_ID, name: "HEB lector (solo lectura)" } };

const esquema = readFileSync("infra/esquema_para_el_agente.md", "utf8");
const ejemplos = readFileSync("infra/ejemplos_sql.md", "utf8");
const guarda = readFileSync("infra/guarda_sql.js", "utf8").replace(/\nif \(typeof module[\s\S]*$/, "").replace(/^\/\/.*\n/gm, "");
const REGLAS = readFileSync("infra/reglas_sql.md", "utf8").trim();
const DESCRIPCION = "Consulta las cifras reales de las 4 tiendas: ventas (jun-ago 2026), inventario al 1-sep-2026, catalogo de productos, tiendas y tickets de la mesa de servicio. Pasa la pregunta completa en espanol, con tienda, periodo y producto si el usuario los dio. Devuelve las filas y el SQL usado. Usala SIEMPRE para cualquier numero, conteo, ranking o comparacion; nunca calcules cifras de memoria.";
const sistemaSQL = ["Eres un analista de datos. Respondes preguntas ejecutando SQL con la herramienta ejecutar_sql.", REGLAS,
  "Si ejecutar_sql devuelve un error, leelo, corrige la consulta y vuelve a intentar (maximo 3 intentos).",
  "Cuando tengas el resultado, responde SOLO con JSON: {\"sql\": \"<la consulta que dio el resultado>\", \"filas\": [...las filas tal cual...], \"total\": <el COUNT(*) real de lo que pregunta el usuario, obtenido con UNA consulta de conteo aparte; NUNCA el numero de filas que devolviste>}. Para listas haz dos consultas separadas: (1) COUNT (y GROUP BY si aplica), (2) hasta 20 filas de detalle; nunca las mezcles con UNION. Si (2) trae mas de 20 filas, recorta a 20: `total` sigue siendo el COUNT.",
  "Si no es respondible: {\"sql\": null, \"filas\": [], \"motivo\": \"<una frase>\"}.",
  "", "## Esquema", esquema, "", "## Ejemplos verificados", ejemplos].join("\n");

// La guarda, como expresion de n8n: una IIFE que valida $fromAI('sql') y devuelve el SQL final o lanza (el error
// vuelve al Agente SQL como resultado de la herramienta, igual que hacia el sub-flujo).
const consultaGuardada = "={{ (() => {\n" + guarda + "\nreturn guardar($fromAI('sql', 'La consulta SELECT completa', 'string')).sql;\n})() }}";

const chat = await api("GET", "/workflows/" + CHAT_ID);
const nota = chat.nodes.find((n) => n.name === "Nota — HEB-aristo");
if (nota) nota.parameters.content = [
  "## HEB-aristo — Chat (Recuperación)", "",
  "Asistente de una gerente de tienda H-E-B (ejercicio de reclutamiento; datos y politicas sinteticos).", "",
  "    POST /webhook/heb-aristo/chat   { input, previous_response_id? }  ->  { status, response_id, respuesta }", "",
  "Memoria por conversacion en `heb_turnos` (Postgres `bano_postgres`, servicio compartido, tabla propia; guarda tokens por turno).", "",
  "**Herramientas del Agente**", "",
  "- `consultar_politicas`: pgvector `heb_aristo_corpus` (4 PDF, cada fragmento con documento y seccion), top-6.",
  "- `consultar_datos`: **AI Agent Tool** (gpt-5-mini) con el esquema comentado y ejemplos verificados; su unica herramienta es",
  "  `ejecutar_sql` = Postgres Tool con la credencial `heb_lector` (solo SELECT en `heb`, timeout 15 s) y la guarda",
  "  determinista (`infra/guarda_sql.js`) como expresion de la consulta: solo SELECT, una sentencia, tablas de `heb`, LIMIT 50.", "",
  "**No editar a mano**: `node infra/crear-flujos.mjs` regenera y sincroniza todo desde el repo (workflows/*.json, prompts/sistema.md,",
  "infra/esquema_para_el_agente.md, infra/ejemplos_sql.md, infra/reglas_sql.md, infra/guarda_sql.js).",
].join("\n");
const agente = chat.nodes.find((n) => n.name === "Agente");
const [ax, ay] = agente.position;
chat.nodes = chat.nodes.filter((n) => !["consultar_datos", "Agente SQL", "Modelo SQL", "ejecutar_sql"].includes(n.name));
for (const k of ["consultar_datos", "Agente SQL", "Modelo SQL", "ejecutar_sql"]) delete chat.connections[k];

{
  chat.nodes.push(
    { id: "agente_sql", name: "consultar_datos", type: "@n8n/n8n-nodes-langchain.agentTool", typeVersion: 3, position: [ax + 420, ay + 260],
      parameters: { toolDescription: DESCRIPCION, text: "={{ $fromAI('pregunta', 'La pregunta del usuario tal cual, con tienda, periodo y producto si los menciono', 'string') }}",
        // needsFallback: el segundo modelo (Modelo SQL de respaldo (NVIDIA), decision 18) queda conectado; sin esta bandera n8n
        // rechaza el nodo ("Only 1 ai_languageModel sub-nodes allowed") y consultar_datos deja de funcionar.
        needsFallback: true, options: { systemMessage: sistemaSQL, maxIterations: 8 } } },
    { id: "modelo_sql", name: "Modelo SQL", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.3, position: [ax + 300, ay + 480],
      parameters: { model: { __rl: true, mode: "id", value: "gpt-5-mini" }, options: { reasoningEffort: "low", maxTokens: 4000, timeout: 90000 } }, credentials: OPENAI },
    { id: "ejecutar_sql", name: "ejecutar_sql", type: "n8n-nodes-base.postgresTool", typeVersion: 2.6, position: [ax + 560, ay + 480],
      parameters: { descriptionType: "manual", toolDescription: "Ejecuta UNA consulta SELECT sobre el esquema heb (solo lectura, LIMIT 50) y devuelve las filas. Si la consulta no es valida devuelve el motivo.",
        operation: "executeQuery", query: consultaGuardada, options: { queryBatching: "independently" } }, credentials: CRED },
  );
  chat.connections["consultar_datos"] = { ai_tool: [[{ node: "Agente", type: "ai_tool", index: 0 }]] };
  chat.connections["Modelo SQL"] = { ai_languageModel: [[{ node: "consultar_datos", type: "ai_languageModel", index: 0 }]] };
  chat.connections["ejecutar_sql"] = { ai_tool: [[{ node: "consultar_datos", type: "ai_tool", index: 0 }]] };
}
const { timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow } = chat.settings || {};
const r = await api("PUT", "/workflows/" + CHAT_ID, { name: chat.name, nodes: chat.nodes, connections: chat.connections,
  settings: JSON.parse(JSON.stringify({ timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow })) });
console.log("consultar_datos (AI Agent Tool + Postgres Tool con guarda) sincronizado en " + r.name + " (nodos=" + r.nodes.length + ")");
