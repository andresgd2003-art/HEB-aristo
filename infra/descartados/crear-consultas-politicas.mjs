// Variante "hijo solo para RAG": sub-flujo "HEB-aristo — Consultas políticas (agente)" con su propio
// AI Agent + herramienta pgvector, que devuelve respuesta + citas. Se cuelga del chat como
// `consultar_politicas` (toolWorkflow) en lugar de la herramienta pgvector directa.
//
// Uso: node infra/crear-consultas-politicas.mjs hijo|directo   (que variante queda en el chat)
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const VARIANTE = process.argv[2] || "directo";
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const CHAT_ID = "ZpkluoNfIEbhI9K8";
const OPENAI = { openAiApi: { id: "khGoYB8EqlxK66fW", name: "OpenAi account" } };
const PG = { postgres: { id: "V0RcqGuqWSuowyhM", name: "BANO Postgres (pgvector)" } };
const DESCRIPCION = "Busca en los 4 documentos internos de H-E-B: Manual de apertura y cierre (MAN-OPS-007), Politica de mermas y caducidad (POL-OPS-014), Procedimiento de devoluciones y cambios (PRO-SAC-021) y Preguntas frecuentes para gerentes (FAQ-OPS-001). Cada fragmento empieza con su documento y seccion: citalos. Usala para toda pregunta de reglas, plazos, procedimientos, responsables o politicas.";
const limpio = (w) => { const { timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow } = w.settings || {}; return { name: w.name, nodes: w.nodes, connections: w.connections, settings: JSON.parse(JSON.stringify({ timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow })) }; };

// --- Sub-flujo hijo ---
const sistema = [
  "Eres el bibliotecario de politicas de H-E-B. Respondes SOLO con lo que devuelve la herramienta buscar_politicas.",
  "Busca al menos una vez; si la pregunta toca dos documentos (por ejemplo una FAQ y un procedimiento), busca dos veces con",
  "formulaciones distintas y compara. Si los documentos difieren, prevalece la politica/manual/procedimiento sobre la FAQ y lo dices.",
  "Cita SIEMPRE con codigo y seccion tal como aparecen en la cabecera del fragmento (ej. PRO-SAC-021 > 3. Plazos de devolucion).",
  "Si no encuentras nada pertinente, di exactamente: NO_ENCONTRADO y en que documentos buscaste.",
  "Responde en espanol, en 2-6 frases, sin saludos.",
].join("\n");
const NOMBRE = "HEB-aristo — Consultas políticas (agente)";
const lista = (await api("GET", "/workflows?limit=250")).data;
const cuerpo = { name: NOMBRE, settings: { executionOrder: "v1" }, nodes: [
  { id: "t", name: "Cuando lo llaman", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: [0, 0],
    parameters: { inputSource: "workflowInputs", workflowInputs: { values: [{ name: "pregunta", type: "string" }] } } },
  { id: "a", name: "Agente políticas", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 3.1, position: [260, 0],
    parameters: { promptType: "define", text: "={{ $json.pregunta }}", options: { systemMessage: sistema, maxIterations: 5 } } },
  { id: "m", name: "Modelo", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.3, position: [140, 220],
    parameters: { model: { __rl: true, mode: "id", value: "gpt-5-mini" }, options: { reasoningEffort: "low", maxTokens: 4000, timeout: 90000 } }, credentials: OPENAI },
  { id: "v", name: "buscar_politicas", type: "@n8n/n8n-nodes-langchain.vectorStorePGVector", typeVersion: 1.3, position: [420, 220],
    parameters: { mode: "retrieve-as-tool", toolDescription: DESCRIPCION, tableName: "heb_aristo_corpus", topK: 6, options: {} }, credentials: PG },
  { id: "e", name: "Embeddings", type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi", typeVersion: 1.2, position: [420, 420], parameters: { options: {} }, credentials: OPENAI },
  { id: "s", name: "Salida", type: "n8n-nodes-base.code", typeVersion: 2, position: [560, 0],
    parameters: { jsCode: "return [{ json: { respuesta: String($input.first().json.output ?? '') } }];" } },
  { id: "nota", name: "Nota", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -300], parameters: { color: 4, width: 640, height: 240,
    content: "## HEB-aristo — Consultas políticas (agente) — variante 'hijo'\n\n`{pregunta}` -> `{respuesta}` con citas. AI Agent propio con la herramienta pgvector (`heb_aristo_corpus`, top-6): puede buscar varias veces y comparar documentos antes de contestar al agente de chat.\n\nComparado contra la herramienta pgvector directa en el chat (variante 'directo') con `tests/gate_prompt.mjs 2 politicas`. Se regenera con `node infra/crear-consultas-politicas.mjs hijo|directo`." } },
], connections: {
  "Cuando lo llaman": { main: [[{ node: "Agente políticas", type: "main", index: 0 }]] },
  "Modelo": { ai_languageModel: [[{ node: "Agente políticas", type: "ai_languageModel", index: 0 }]] },
  "buscar_politicas": { ai_tool: [[{ node: "Agente políticas", type: "ai_tool", index: 0 }]] },
  "Embeddings": { ai_embedding: [[{ node: "buscar_politicas", type: "ai_embedding", index: 0 }]] },
  "Agente políticas": { main: [[{ node: "Salida", type: "main", index: 0 }]] },
} };
const ya = lista.find((w) => w.name === NOMBRE);
const hijo = ya ? await api("PUT", "/workflows/" + ya.id, cuerpo) : await api("POST", "/workflows", cuerpo);
await api("POST", "/workflows/" + hijo.id + "/activate").catch((e) => { if (!/already|active/i.test(e.message)) throw e; });
console.log((ya ? "Actualizado " : "Creado ") + hijo.name + " id=" + hijo.id);

// --- Cambiar la herramienta consultar_politicas del chat ---
const chat = await api("GET", "/workflows/" + CHAT_ID);
const viejo = chat.nodes.find((n) => n.name === "consultar_politicas");
const pos = viejo ? viejo.position : [900, 400];
chat.nodes = chat.nodes.filter((n) => n.name !== "consultar_politicas" && n.name !== "Embeddings OpenAI");
delete chat.connections["consultar_politicas"]; delete chat.connections["Embeddings OpenAI"];
if (VARIANTE === "hijo") {
  chat.nodes.push({ id: "tool_pol", name: "consultar_politicas", type: "@n8n/n8n-nodes-langchain.toolWorkflow", typeVersion: 2.2, position: pos,
    parameters: { name: "consultar_politicas", description: DESCRIPCION + " Devuelve una respuesta ya redactada con sus citas: transmitela con las citas intactas.",
      workflowId: { __rl: true, mode: "id", value: hijo.id },
      workflowInputs: { mappingMode: "defineBelow", value: { pregunta: "={{ $fromAI('pregunta', 'La pregunta de politica tal cual la hizo la gerente', 'string') }}" },
        matchingColumns: ["pregunta"], schema: [{ id: "pregunta", displayName: "pregunta", required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: "string" }] } } });
} else {
  chat.nodes.push({ id: "tool_pol", name: "consultar_politicas", type: "@n8n/n8n-nodes-langchain.vectorStorePGVector", typeVersion: 1.3, position: pos,
    parameters: { mode: "retrieve-as-tool", toolDescription: DESCRIPCION, tableName: "heb_aristo_corpus", topK: 6, options: {} }, credentials: PG });
  chat.nodes.push({ id: "emb_pol", name: "Embeddings OpenAI", type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi", typeVersion: 1.2, position: [pos[0], pos[1] + 200], parameters: { options: {} }, credentials: OPENAI });
  chat.connections["Embeddings OpenAI"] = { ai_embedding: [[{ node: "consultar_politicas", type: "ai_embedding", index: 0 }]] };
}
chat.connections["consultar_politicas"] = { ai_tool: [[{ node: "Agente", type: "ai_tool", index: 0 }]] };
const r = await api("PUT", "/workflows/" + CHAT_ID, limpio(chat));
console.log("consultar_politicas -> variante " + VARIANTE + " en " + r.name + " (nodos=" + r.nodes.length + ")");
