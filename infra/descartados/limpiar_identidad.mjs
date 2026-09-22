// Ticket 11: quita la identidad de BANO de los flujos HEB-aristo (notas, nombres, comentarios,
// constantes) y los apunta a su propia tabla de turnos. Idempotente. Exporta los JSON a workflows/.
//
// Orden de scripts: (repo BANO) infra/crear-heb-aristo.mjs -> este -> crear-consultas-sql.mjs -> desplegar-prompt.mjs
// Uso: node infra/limpiar_identidad.mjs
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 300)); return j; };
const FLUJOS = { chat: "ZpkluoNfIEbhI9K8", ingesta: "URV7gCYGOiy3G9go", ejecutar: "U8AZTa8oGIp5NV21", sql_agente: "hvtOA1Vxq01Tnujq", sql_cadena: "HhHRb2CLFh8l2raR", test_sql: "1L7dQeoI5ximbrgt" };
const nodo = (w, n) => w.nodes.find((x) => x.name === n);
const quitar = (w, n) => { w.nodes = w.nodes.filter((x) => x.name !== n); delete w.connections[n]; };

// ---------- Chat ----------
const chat = await api("GET", "/workflows/" + FLUJOS.chat);
quitar(chat, "Nota — autenticacion");           // los nodos que describia ya no existen
quitar(chat, "Nota — que es esto");
nodo(chat, "Nota — HEB-aristo").parameters.content = [
  "## HEB-aristo — Chat",
  "",
  "Asistente de una gerente de tienda H-E-B (ejercicio de reclutamiento; datos y politicas sinteticos).",
  "",
  "    POST /webhook/heb-aristo/chat   { input, previous_response_id? }  ->  { status, response_id, respuesta }",
  "",
  "Sin autenticacion por ahora: el canal final no esta decidido (ticket 06). `response_id` encadena turnos; la",
  "memoria vive en la tabla `heb_turnos` (Postgres `bano_postgres`, servicio compartido, tabla propia).",
  "",
  "**Herramientas del Agente**: `consultar_politicas` (pgvector `heb_aristo_corpus`, 4 PDF con documento y seccion)",
  "y `consultar_datos` (sub-flujo *Consultas SQL (agente)* -> *Ejecutar SQL*: guarda + Postgres solo lectura).",
  "",
  "**No editar a mano**: todo se regenera desde el repo HEB-aristo (`infra/`), y el prompt del Agente desde",
  "`prompts/sistema.md` con `infra/desplegar-prompt.mjs`.",
].join("\n");
Object.assign(nodo(chat, "Nota — HEB-aristo").parameters, { width: 640, height: 320 });

// Herramienta RAG: nombre, descripcion y sin el filtro de idioma (todo el corpus es espanol).
const rag = nodo(chat, "corpus_trayectoria");
if (rag) {
  rag.name = "consultar_politicas";
  chat.connections["consultar_politicas"] = chat.connections["corpus_trayectoria"]; delete chat.connections["corpus_trayectoria"];
  for (const c of Object.values(chat.connections)) for (const tipo of Object.values(c)) for (const salida of tipo) for (const e of salida) if (e.node === "corpus_trayectoria") e.node = "consultar_politicas";
}
Object.assign(nodo(chat, "consultar_politicas").parameters, {
  toolDescription: "Busca en los 4 documentos internos de H-E-B: Manual de apertura y cierre (MAN-OPS-007), Politica de mermas y caducidad (POL-OPS-014), Procedimiento de devoluciones y cambios (PRO-SAC-021) y Preguntas frecuentes para gerentes (FAQ-OPS-001). Cada fragmento empieza con su documento y seccion: citalos. Usala para toda pregunta de reglas, plazos, procedimientos, responsables o politicas.",
  topK: 6, options: {},
});
delete nodo(chat, "consultar_politicas").parameters.options?.systemMessage;

// Prompt provisional hasta el ticket 05 (el real se versiona en prompts/sistema.md).
nodo(chat, "Agente").parameters.options.systemMessage = readFileSync("prompts/sistema.md", "utf8");

// Comentarios y constantes heredadas en los nodos Code.
const code = (n, pares) => { const x = nodo(chat, n); for (const [a, b] of pares) x.parameters.jsCode = x.parameters.jsCode.split(a).join(b); };
code("Validar entrada", [
  ["sobra para pegar una vacante entera, que es\n// el caso de uso real", "sobra para pegar un reporte entero"],
  ["aunque el spec lo declare obligatorio: la plataforma real\n// manda {input, stream, store} sin ese campo (ejecucion 68798). Exigirlo romperia\n// el endpoint en el primer mensaje del evaluador.", "el flujo fija el modelo."],
  ["la plataforma manda solo {role, type, content}.", "el canal puede mandar solo {role, type, content}."],
  ["la plataforma no reenvia", "el canal no reenvia"],
]);
code("Decidir conversacion", [
  ["el evaluador creeria que BANO perdio la memoria", "quien pregunta creeria que el asistente perdio la memoria"],
  ["(flujo \"BANO - Limpieza de turnos\")", "(pendiente: limpieza de heb_turnos)"],
  ["BANO responde sin memoria", "el asistente responde sin memoria"],
]);
code("Formatear response", [
  ["// Envuelve la respuesta del agente en un objeto `response` conforme a Open Responses.", "// Empaqueta la respuesta del agente en el contrato generico {status, response_id, respuesta}."],
  ["// El modelo lo fija el flujo, no el cliente: un `model` entrante se IGNORA (ADR-0002).\n// Devolver el que mandaron seria mentir sobre quien respondio.\n", ""],
  ["// La mantiene sincronizada infra/desplegar-prompt.mjs con prompts/sistema.md.", "// La mantiene sincronizada infra/desplegar-prompt.mjs con prompts/sistema.md (repo HEB-aristo)."],
  ["const PROMPT_VERSION = '21';", "const PROMPT_VERSION = '0';"],
]);
// Registro de turnos: contrato nuevo y tabla propia. Sin esto NO se registraba nada (rompia el encadenado).
code("Preparar registro", [
  ["response_id: r.cuerpo.id,", "response_id: r.cuerpo.response_id,"],
  ["salida: r.cuerpo.output[0].content[0].text,", "salida: r.cuerpo.respuesta,"],
  ["modelo: r.cuerpo.model,", "modelo: MODELO_DEL_TURNO,"],
]);
{ // Idempotente: quita copias previas de la constante y deja exactamente una.
  const pr = nodo(chat, "Preparar registro").parameters;
  pr.jsCode = "const MODELO_DEL_TURNO = 'gpt-5-mini';\n" + pr.jsCode.split("const MODELO_DEL_TURNO = 'gpt-5-mini';\n").join("");
}
// Errores del guardia (id caducado, limites) al contrato generico {status:'error', code, respuesta}.
{
  const dc = nodo(chat, "Decidir conversacion").parameters;
  // `message` puede ser una concatenacion multilinea ('...' + MAX + '...'); se captura hasta `param:`.
  dc.jsCode = dc.jsCode.replace(/cuerpo: \{\s*error: \{\s*type: '[a-z_]+',\s*code: '([a-z_]+)',\s*message: ([\s\S]*?),\s*param: [^,]+,\s*\},\s*\}/g,
    "cuerpo: { status: 'error', code: '$1', respuesta: $2 }");
}
for (const n of ["Resolver conversacion", "Registrar turno"]) nodo(chat, n).parameters.query = nodo(chat, n).parameters.query.replace(/\bturnos\b/g, "heb_turnos");

// Las notas de nodo (campo `notes`) tambien heredan texto.
for (const n of chat.nodes) if (n.notes) n.notes = n.notes.replace(/BANO/g, "el asistente");

// ---------- Ingesta ----------
const ing = await api("GET", "/workflows/" + FLUJOS.ingesta);
quitar(ing, "Nota — HEB-aristo");
nodo(ing, "Nota — ingesta").parameters.content = [
  "## HEB-aristo — Ingesta del corpus",
  "",
  "Flujo aparte del chat: se dispara a mano cuando cambia un documento, nunca en cada turno.",
  "",
  "    POST /webhook/heb-aristo/v1/ingesta   Authorization: Bearer <token de ingesta>",
  "    { \"documento\": \"POL-OPS-014 Politica de mermas y caducidad\", \"contenido\": \"<markdown>\" }",
  "    POST /webhook/heb-aristo/v1/buscar    { \"pregunta\": \"...\", \"top_k\": 4 }   (para pruebas de recuperacion)",
  "",
  "Fuente: `corpus/politicas/*.md`, generados de los PDF por `infra/pdf_a_markdown.py` (tablas reconstruidas a mano en",
  "`infra/tablas_politicas.py`). Se ingiere con `node infra/ingerir_politicas.mjs`.",
  "",
  "### Como trocea",
  "`Trocear con contexto` parte por `##`/`###` y cada fragmento lleva su cabecera `documento > seccion > subseccion`:",
  "un fragmento debe poder decir de que habla sin sus vecinos. Tamano 1000, sin solape. Metadata: documento, seccion, subseccion.",
  "",
  "### Reejecutar NO duplica",
  "`Borrar version anterior` limpia `heb_aristo_corpus` por `metadata->>'documento'` antes de insertar.",
  "",
  "### Trampas",
  "- La limpieza va antes de partir por seccion (executeOnce colapsa los items).",
  "- Embeddings text-embedding-3-small (OpenAI, 1536 dims): cambiar de modelo obliga a reindexar.",
].join("\n");
Object.assign(nodo(ing, "Nota — ingesta").parameters, { width: 760, height: 420 });

// ---------- Publicar y exportar ----------
const limpio = (w) => { const { timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow } = w.settings || {}; return { name: w.name, nodes: w.nodes, connections: w.connections, settings: JSON.parse(JSON.stringify({ timezone, executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveManualExecutions, saveExecutionProgress, executionTimeout, errorWorkflow })) }; };
await api("PUT", "/workflows/" + FLUJOS.chat, limpio(chat));
await api("PUT", "/workflows/" + FLUJOS.ingesta, limpio(ing));

mkdirSync("workflows", { recursive: true });
for (const [k, id] of Object.entries(FLUJOS)) {
  const w = await api("GET", "/workflows/" + id);
  const s = JSON.stringify(limpio(w), null, 2);
  writeFileSync(`workflows/heb-aristo-${k}.json`, s);
  // Excepciones aceptadas: host/tabla de Postgres y nombres de credenciales compartidas con BANO.
  const sinCred = s.replace(/"name": "BANO [^"]*"/g, "").replace(/bano_postgres|bano_corpus/g, "");
  const restos = sinCred.match(/bano|trayectoria|andr[eé]s|open responses|evaluador|portafolio/gi) || [];
  console.log(`${w.name}: ${w.nodes.length} nodos -> workflows/heb-aristo-${k}.json | restos BANO: ${restos.length ? [...new Set(restos.map((r) => r.toLowerCase()))].join(",") : "0"}`);
}
