// Crea (o actualiza) los flujos del agente hijo de SQL y cuelga la variante elegida del agente de
// chat como herramienta `consultar_datos`. Idempotente.
//
//   "HEB-aristo — Ejecutar SQL"            guarda determinista + Postgres (heb_lector). Lo usan A y B.
//   "HEB-aristo — Consultas SQL (cadena)"  A: LLM Chain con salida estructurada -> Ejecutar SQL -> 1 reintento
//   "HEB-aristo — Consultas SQL (agente)"  B: AI Agent con la herramienta ejecutar_sql; itera solo
//
// Uso: node infra/crear-consultas-sql.mjs [cadena|agente]   (que variante cuelga del chat; default cadena)
import { readFileSync, existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const VARIANTE = process.argv[2] || "cadena";
const API = env.N8N_BASE_URL.replace(/\/$/, ""), KEY = env.N8N_API_KEY;
const CHAT_ID = "ZpkluoNfIEbhI9K8";
const CRED = "HEB lector (solo lectura)";
const OPENAI = { openAiApi: { id: "khGoYB8EqlxK66fW", name: "OpenAi account" } };
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => {
  const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(m + " " + p + " -> " + r.status + " " + JSON.stringify(j).slice(0, 300));
  return j;
};
const lista = (await api("GET", "/workflows?limit=250")).data;
async function publicar(cuerpo) {
  const ya = lista.find((w) => w.name === cuerpo.name);
  const w = ya ? await api("PUT", "/workflows/" + ya.id, cuerpo) : await api("POST", "/workflows", cuerpo);
  // n8n 2.x: un sub-flujo tiene que estar publicado (activo) para que otro lo referencie.
  await api("POST", "/workflows/" + w.id + "/activate").catch((e) => { if (!/already|active/i.test(e.message)) throw e; });
  console.log((ya ? "Actualizado " : "Creado ") + w.name + " id=" + w.id);
  return w;
}

// --- 1. Credencial Postgres de solo lectura (id guardado en .env como HEB_CRED_ID para no duplicarla) ---
let credId = env.HEB_CRED_ID;
if (!credId) {
  const c = await api("POST", "/credentials", { name: CRED, type: "postgres", data: {
    host: env.HEB_PG_HOST, port: 5432, database: env.HEB_PG_DB, user: env.HEB_PG_USER,
    password: env.HEB_LECTOR_PASSWORD, ssl: "disable", sshTunnel: false } });
  credId = c.id;
  console.log("Credencial creada:", credId, "-> agrega HEB_CRED_ID=" + credId + " al .env");
}

const esquema = readFileSync("infra/esquema_para_el_agente.md", "utf8");
const ejemplos = readFileSync("infra/ejemplos_sql.md", "utf8");
const guarda = readFileSync("infra/guarda_sql.js", "utf8").replace(/\nif \(typeof module[\s\S]*$/, "");
const trigger = (id, campos) => ({ id, name: "Cuando lo llaman", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: [0, 0],
  parameters: { inputSource: "workflowInputs", workflowInputs: { values: campos.map((name) => ({ name, type: "string" })) } } });
const code = (id, name, pos, lineas, extra = {}) => ({ id, name, type: "n8n-nodes-base.code", typeVersion: 2, position: pos, parameters: { jsCode: lineas.join("\n") }, ...extra });
const nota = (content, width = 700, height = 300) => ({ id: "nota", name: "Nota", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -360], parameters: { color: 4, width, height, content } });
const REGLAS = [
  "Produce UNA sola consulta SELECT para PostgreSQL 17, sin comentarios y sin punto y coma final,",
  "usando solo las tablas y reglas del esquema. Pon alias legibles en espanol a las columnas",
  "calculadas. Redondea montos a 2 decimales. Ordena de mayor a menor cuando se pida un ranking.",
  "La granularidad la fija la pregunta: si pide un total ('cuanto', 'cuantos', 'en total', 'las cuatro",
  "tiendas'), devuelve UNA fila con el total; si pide 'por tienda', 'por mes', 'cual', 'ranking',",
  "devuelve el desglose. Nunca inventes un filtro de tienda o periodo que el usuario no dio.",
  "Si la pregunta no puede responderse con estas tablas (merma, septiembre en adelante, competidores,",
  "opiniones), no consultes nada y dilo.",
].join("\n");

// --- 2. Ejecutar SQL: guarda + Postgres. Sub-flujo compartido por A y B ---
const ejecutar = await publicar({ name: "HEB-aristo — Ejecutar SQL", settings: { executionOrder: "v1" }, nodes: [
  trigger("t", ["sql"]),
  code("v", "Guarda SQL", [260, 0], [guarda, "",
    "try { return [{ json: guardar($input.first().json.sql) }]; }",
    "catch (e) { return [{ json: { sql: null, rechazo: e.message } }]; }"]),
  { id: "i", name: "Paso la guarda", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [500, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.sql }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] }, looseTypeValidation: true } },
  { id: "p", name: "Postgres (solo lectura)", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [760, -100],
    parameters: { operation: "executeQuery", query: "={{ $json.sql }}", options: { queryBatching: "independently" } },
    credentials: { postgres: { id: credId, name: CRED } }, onError: "continueErrorOutput", alwaysOutputData: true },
  code("r", "Filas", [1020, -100], [
    "const sql = $('Guarda SQL').first().json.sql;",
    "const filas = $input.all().map((i) => i.json).filter((j) => Object.keys(j).length);",
    "return [{ json: { ok: true, sql, n: filas.length, filas } }];"]),
  code("e", "Error de Postgres", [1020, 100], [
    "// Solo la primera linea del error, sin traza: es lo que el modelo necesita para corregir.",
    "const msg = String($input.first().json?.error?.message ?? $input.first().json?.error ?? 'error desconocido').split('\\n')[0].slice(0, 300);",
    "return [{ json: { ok: false, sql: $('Guarda SQL').first().json.sql, error: msg } }];"]),
  code("x", "Rechazo de la guarda", [760, 120], ["return [{ json: { ok: false, sql: null, error: $input.first().json.rechazo } }];"]),
  nota("## HEB-aristo — Ejecutar SQL\n\nUnica puerta a la base para los agentes. `{sql}` -> `{ok, sql, n, filas}` o `{ok:false, error}`.\n\n1. **Guarda SQL** (`infra/guarda_sql.js`, determinista): solo SELECT, una sentencia, sin comentarios, tablas del esquema `heb`, LIMIT 200.\n2. **Postgres** con `heb_lector`: solo SELECT en `heb`, timeout 15 s. Tercera capa, a nivel de base.\n\nSe regenera con `node infra/crear-consultas-sql.mjs`.", 640, 240),
], connections: {
  "Cuando lo llaman": { main: [[{ node: "Guarda SQL", type: "main", index: 0 }]] },
  "Guarda SQL": { main: [[{ node: "Paso la guarda", type: "main", index: 0 }]] },
  "Paso la guarda": { main: [[{ node: "Postgres (solo lectura)", type: "main", index: 0 }], [{ node: "Rechazo de la guarda", type: "main", index: 0 }]] },
  "Postgres (solo lectura)": { main: [[{ node: "Filas", type: "main", index: 0 }], [{ node: "Error de Postgres", type: "main", index: 0 }]] },
} });
const llamarEjecutar = (id, name, pos, sqlExpr) => ({ id, name, type: "n8n-nodes-base.executeWorkflow", typeVersion: 1.2, position: pos,
  parameters: { workflowId: { __rl: true, mode: "id", value: ejecutar.id }, workflowInputs: { mappingMode: "defineBelow", value: { sql: sqlExpr },
    matchingColumns: ["sql"], schema: [{ id: "sql", displayName: "sql", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] }, options: {} } });

// --- 3A. Cadena: LLM Chain + salida estructurada + 1 reintento con el error ---
const promptA = ["Eres un generador de SQL.", REGLAS,
  "Si no es respondible, deja sql en null y explica el motivo en una frase en `motivo`.",
  "", "## Esquema", esquema, "", "## Ejemplos verificados", ejemplos, "", "## Pregunta", "{{ $json.pregunta }}",
  "{{ $json.error_previo ? '\\n## Tu consulta anterior fallo en Postgres. Corrigela.\\nSQL anterior: ' + $json.sql_previo + '\\nError: ' + $json.error_previo : '' }}",
].join("\n");
const cadena = await publicar({ name: "HEB-aristo — Consultas SQL (cadena)", settings: { executionOrder: "v1" }, nodes: [
  trigger("t", ["pregunta"]),
  { id: "g", name: "Generar SQL", type: "@n8n/n8n-nodes-langchain.chainLlm", typeVersion: 1.7, position: [260, 0],
    parameters: { promptType: "define", text: "=" + promptA, hasOutputParser: true, batching: {} } },
  { id: "m", name: "Modelo SQL", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.3, position: [200, 220],
    parameters: { model: { __rl: true, mode: "id", value: "gpt-5-mini" }, options: { reasoningEffort: "low", maxTokens: 2000, timeout: 90000 } }, credentials: OPENAI },
  { id: "o", name: "Formato de salida", type: "@n8n/n8n-nodes-langchain.outputParserStructured", typeVersion: 1.3, position: [420, 220],
    parameters: { schemaType: "manual", inputSchema: JSON.stringify({ type: "object", properties: {
      sql: { type: ["string", "null"], description: "La consulta SELECT, o null si no es respondible" },
      motivo: { type: ["string", "null"], description: "Por que no es respondible; null si hay sql" } }, required: ["sql", "motivo"] }) } },
  code("s", "Separar", [560, 0], [
    "const o = $input.first().json.output ?? {};",
    "const intento = Number($('Cuando lo llaman').first().json.intento ?? 1) + ($runIndex ?? 0);",
    "return [{ json: { sql: o.sql || '', motivo: o.motivo || null, intento } }];"]),
  { id: "i", name: "Hay SQL", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [800, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.sql }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] }, looseTypeValidation: true } },
  llamarEjecutar("x", "Ejecutar SQL", [1060, -100], "={{ $json.sql }}"),
  code("d", "Decidir", [1320, -100], [
    "// ok -> devolver. Error de Postgres -> UNA vez se le devuelve al modelo (refinamiento guiado por",
    "// ejecucion). Segunda vez -> se reporta el motivo, nunca un 200 vacio.",
    "const r = $input.first().json;",
    "const intento = $('Separar').last().json.intento;",
    "if (r.ok || intento >= 2 || !r.sql) return [{ json: r }];",
    "return [{ json: { reintento: true, pregunta: $('Cuando lo llaman').first().json.pregunta, sql_previo: r.sql, error_previo: r.error, intento: 2 } }];"]),
  { id: "ri", name: "Reintentar", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1560, -100],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.reintento }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }] }, looseTypeValidation: true } },
  code("n", "No respondible", [1060, 120], ["return [{ json: { ok: false, sql: null, error: $input.first().json.motivo || 'El modelo no produjo SQL.' } }];"]),
  // Un sub-flujo devuelve la salida de su ULTIMO nodo ejecutado: la rama "no reintentar" del IF
  // acababa vacia y el padre recibia nada. Este nodo es la salida unica.
  code("z", "Salida", [1800, 0], ["return [{ json: $input.first().json }];"]),
  nota("## HEB-aristo — Consultas SQL (cadena) — variante A\n\n`{pregunta}` -> `{ok, sql, n, filas}`.\n\nLLM Chain (gpt-5-mini, razonamiento bajo) con esquema aumentado (`infra/esquema_para_el_agente.md`), ejemplos verificados (`infra/ejemplos_sql.md`) y salida estructurada `{sql, motivo}` -> **Ejecutar SQL** (guarda + Postgres). Si Postgres rechaza, **un** reintento con el error de vuelta al modelo.\n\nComparada contra la variante B (agente) en `tests/cifras_sql.mjs`; decision en `.scratch/heb-aristo/decision_sql.md`."),
], connections: {
  "Cuando lo llaman": { main: [[{ node: "Generar SQL", type: "main", index: 0 }]] },
  "Modelo SQL": { ai_languageModel: [[{ node: "Generar SQL", type: "ai_languageModel", index: 0 }]] },
  "Formato de salida": { ai_outputParser: [[{ node: "Generar SQL", type: "ai_outputParser", index: 0 }]] },
  "Generar SQL": { main: [[{ node: "Separar", type: "main", index: 0 }]] },
  "Separar": { main: [[{ node: "Hay SQL", type: "main", index: 0 }]] },
  "Hay SQL": { main: [[{ node: "Ejecutar SQL", type: "main", index: 0 }], [{ node: "No respondible", type: "main", index: 0 }]] },
  "Ejecutar SQL": { main: [[{ node: "Decidir", type: "main", index: 0 }]] },
  "Decidir": { main: [[{ node: "Reintentar", type: "main", index: 0 }]] },
  "Reintentar": { main: [[{ node: "Generar SQL", type: "main", index: 0 }], [{ node: "Salida", type: "main", index: 0 }]] },
  "No respondible": { main: [[{ node: "Salida", type: "main", index: 0 }]] },
} });

// --- 3B. Agente hijo: AI Agent con la herramienta ejecutar_sql; itera hasta tener el dato ---
const sistemaB = ["Eres un analista de datos. Respondes preguntas ejecutando SQL con la herramienta ejecutar_sql.", REGLAS,
  "Si ejecutar_sql devuelve ok:false, lee el error, corrige la consulta y vuelve a intentar (maximo 3 intentos).",
  "Cuando tengas el resultado, responde SOLO con JSON: {\"sql\": \"<la consulta que dio el resultado>\", \"filas\": [...las filas tal cual...]}.",
  "Si no es respondible: {\"sql\": null, \"filas\": [], \"motivo\": \"<una frase>\"}.",
  "", "## Esquema", esquema, "", "## Ejemplos verificados", ejemplos].join("\n");
const agente = await publicar({ name: "HEB-aristo — Consultas SQL (agente)", settings: { executionOrder: "v1" }, nodes: [
  trigger("t", ["pregunta"]),
  { id: "a", name: "Agente SQL", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 3.1, position: [260, 0],
    parameters: { promptType: "define", text: "={{ $json.pregunta }}", options: { systemMessage: sistemaB, maxIterations: 8 } } },
  { id: "m", name: "Modelo SQL", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.3, position: [140, 220],
    parameters: { model: { __rl: true, mode: "id", value: "gpt-5-mini" }, options: { reasoningEffort: "low", maxTokens: 4000, timeout: 90000 } }, credentials: OPENAI },
  { id: "h", name: "ejecutar_sql", type: "@n8n/n8n-nodes-langchain.toolWorkflow", typeVersion: 2.2, position: [420, 220],
    parameters: { name: "ejecutar_sql", description: "Ejecuta UNA consulta SELECT sobre el esquema heb y devuelve {ok, sql, n, filas} o {ok:false, error}. Solo lectura.",
      workflowId: { __rl: true, mode: "id", value: ejecutar.id },
      workflowInputs: { mappingMode: "defineBelow", value: { sql: "={{ $fromAI('sql', 'La consulta SELECT completa', 'string') }}" },
        matchingColumns: ["sql"], schema: [{ id: "sql", displayName: "sql", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] } } },
  code("p", "Empaquetar", [560, 0], [
    "// La respuesta final del agente es JSON con sql y filas; se normaliza al mismo contrato que A.",
    "let t = String($input.first().json.output ?? '').trim();",
    "const f = t.match(/```(?:json)?\\s*([\\s\\S]*?)```/); if (f) t = f[1].trim();",
    "let o; try { o = JSON.parse(t); } catch { return [{ json: { ok: false, sql: null, error: 'El agente no devolvio JSON: ' + t.slice(0, 200) } }]; }",
    "if (!o.sql) return [{ json: { ok: false, sql: null, error: o.motivo || 'no respondible' } }];",
    "return [{ json: { ok: true, sql: o.sql, n: (o.filas || []).length, filas: o.filas || [] } }];"]),
  nota("## HEB-aristo — Consultas SQL (agente) — variante B\n\n`{pregunta}` -> `{ok, sql, n, filas}`.\n\nAI Agent (gpt-5-mini) con el mismo esquema y ejemplos que A, y la herramienta `ejecutar_sql` (-> **Ejecutar SQL**: guarda + Postgres). El agente decide cuantas veces consultar y se corrige solo con los errores (max 8 iteraciones).\n\nComparada contra la variante A (cadena) en `tests/cifras_sql.mjs`; decision en `.scratch/heb-aristo/decision_sql.md`."),
], connections: {
  "Cuando lo llaman": { main: [[{ node: "Agente SQL", type: "main", index: 0 }]] },
  "Modelo SQL": { ai_languageModel: [[{ node: "Agente SQL", type: "ai_languageModel", index: 0 }]] },
  "ejecutar_sql": { ai_tool: [[{ node: "Agente SQL", type: "ai_tool", index: 0 }]] },
  "Agente SQL": { main: [[{ node: "Empaquetar", type: "main", index: 0 }]] },
} });

// --- 4. Flujo TEST: webhook -> variante elegida por body.variante ---
const llamarHijo = (id, name, pos, wf) => ({ id, name, type: "n8n-nodes-base.executeWorkflow", typeVersion: 1.2, position: pos,
  parameters: { workflowId: { __rl: true, mode: "id", value: wf.id }, workflowInputs: { mappingMode: "defineBelow", value: { pregunta: "={{ $('Webhook').first().json.body.pregunta }}" },
    matchingColumns: ["pregunta"], schema: [{ id: "pregunta", displayName: "pregunta", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] }, options: {} } });
await publicar({ name: "HEB-aristo — TEST consultar_datos", settings: { executionOrder: "v1" }, nodes: [
  { id: "w", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "heb-aristo-test-sql",
    parameters: { httpMethod: "POST", path: "heb-aristo/test/sql", responseMode: "lastNode", options: {} } },
  { id: "s", name: "Variante", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [260, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.body.variante }}", rightValue: "agente", operator: { type: "string", operation: "equals" } }] }, looseTypeValidation: true } },
  llamarHijo("b", "Agente", [520, -100], agente), llamarHijo("a", "Cadena", [520, 100], cadena),
  nota("## TEST — no es produccion\n\nPOST /webhook/heb-aristo/test/sql {pregunta, variante: 'cadena'|'agente'}. Lo usa `tests/cifras_sql.mjs` para medir A contra B sin pasar por el agente de chat.", 520, 160),
], connections: {
  Webhook: { main: [[{ node: "Variante", type: "main", index: 0 }]] },
  Variante: { main: [[{ node: "Agente", type: "main", index: 0 }], [{ node: "Cadena", type: "main", index: 0 }]] },
} });

// --- 5. Herramienta consultar_datos en el flujo de chat, apuntando a la variante elegida ---
const hijo = VARIANTE === "agente" ? agente : cadena;
const chat = await api("GET", "/workflows/" + CHAT_ID);
const nodes = chat.nodes.filter((n) => n.name !== "consultar_datos");
const ag = nodes.find((n) => n.name === "Agente");
nodes.push({ id: "tool_sql", name: "consultar_datos", type: "@n8n/n8n-nodes-langchain.toolWorkflow", typeVersion: 2.2,
  position: [ag.position[0] + 420, ag.position[1] + 260],
  parameters: {
    name: "consultar_datos",
    description: "Consulta las cifras reales de las 4 tiendas: ventas (jun-ago 2026), inventario al 1-sep-2026, catalogo de productos, tiendas y tickets de la mesa de servicio. Pasa la pregunta completa en espanol, con tienda, periodo y producto si el usuario los dio. Devuelve las filas y el SQL usado. Usala SIEMPRE para cualquier numero, conteo, ranking o comparacion; nunca calcules cifras de memoria.",
    workflowId: { __rl: true, mode: "id", value: hijo.id },
    workflowInputs: { mappingMode: "defineBelow", value: { pregunta: "={{ $fromAI('pregunta', 'La pregunta del usuario tal cual, con tienda, periodo y producto si los menciono', 'string') }}" },
      matchingColumns: ["pregunta"], schema: [{ id: "pregunta", displayName: "pregunta", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] },
  } });
const connections = { ...chat.connections, consultar_datos: { ai_tool: [[{ node: "Agente", type: "ai_tool", index: 0 }]] } };
const { timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow } = chat.settings || {};
const settings = JSON.parse(JSON.stringify({ timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow }));
const r = await api("PUT", "/workflows/" + CHAT_ID, { name: chat.name, nodes, connections, settings });
console.log("consultar_datos -> " + hijo.name + " en " + r.name + " (nodos=" + r.nodes.length + ")");
