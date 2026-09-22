// Ticket 13: flujo "HEB-aristo — Telegram", adaptador delgado sobre el webhook del chat.
//   Telegram Trigger (solo TELEGRAM_USER_IDS) -> texto o voz (Get File -> OpenAI Transcribe whisper-1)
//   -> hash del chat (SHA-256 + sal) -> leer sesion (heb_sesiones) -> POST /heb-aristo/chat -> guardar sesion -> responder.
//   /nueva reinicia la conversacion. Errores del webhook se traducen a una frase; nunca silencio.
// Idempotente. Crea la credencial telegramApi si no hay TELEGRAM_CRED_ID en .env.
// Uso: node infra/crear-telegram.mjs
import { readFileSync, existsSync, appendFileSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
for (const k of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_USER_IDS", "TELEGRAM_SAL", "N8N_BASE_URL", "N8N_API_KEY"]) if (!env[k]) { console.error("Falta " + k + " en .env"); process.exit(2); }
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 400)); return j; };

let credId = env.TELEGRAM_CRED_ID;
if (!credId) {
  const c = await api("POST", "/credentials", { name: "HEB-aristo Telegram", type: "telegramApi", data: { accessToken: env.TELEGRAM_BOT_TOKEN } });
  credId = c.id; appendFileSync(".env", `TELEGRAM_CRED_ID=${credId}\n`); console.log("Credencial Telegram creada:", credId);
}
const TG = { telegramApi: { id: credId, name: "HEB-aristo Telegram" } };
const OPENAI = { openAiApi: { id: "khGoYB8EqlxK66fW", name: "OpenAi account" } };
const PG = { postgres: { id: "V0RcqGuqWSuowyhM", name: "BANO Postgres (pgvector)" } };
const CHAT_URL = API + "/webhook/heb-aristo/chat";
const formato = readFileSync("infra/telegram_formato.js", "utf8").replace(/\nif \(typeof module[\s\S]*$/, "").replace(/^\/\/.*\n/gm, "");
const AYUDA = JSON.stringify(readFileSync("infra/telegram_ayuda.md", "utf8").trim());
const EJEMPLOS = JSON.stringify(readFileSync("infra/telegram_ejemplos.md", "utf8").trim());
const code = (id, name, pos, lineas, extra = {}) => ({ id, name, type: "n8n-nodes-base.code", typeVersion: 2, position: pos, parameters: { jsCode: lineas.join("\n") }, ...extra });

// Botones inline (callback_data <= 64 bytes) -> pregunta fija. Deterministas: el agente no sabe que existen.
const BOTONES = {
  "sig:tienda": "Desglósalo por tienda", "sig:mes": "Desglósalo por mes", "sig:dev": "¿Cuánto se devolvió en ese mismo periodo?",
  "sig:sec": "Muéstrame completa la sección del documento que citaste", "sig:docs": "¿Qué otros documentos o secciones hablan de esto?",
  "sig:tk": "¿Qué tickets hubo ese día en esa tienda?",
  "menu:ventas": "menu:ventas", "menu:inventario": "menu:inventario", "menu:tickets": "menu:tickets", "menu:politicas": "menu:politicas",
  "q:v1": "¿Cuál fue la venta total de las cuatro tiendas en el trimestre?", "q:v2": "¿Qué categoría vende más en T03?", "q:v3": "¿Cuánto se devolvió en junio?",
  "q:i1": "¿Qué productos de T02 están bajo su punto de reorden?", "q:i2": "¿Qué caduca antes del 15 de septiembre en T04?", "q:i3": "¿Qué productos perecederos debo retirar del anaquel hoy según la política?",
  "q:t1": "¿Cuántos tickets críticos hubo?", "q:t2": "¿Qué pasó con las ventas de T02 del 14 al 16 de julio?", "q:t3": "¿Cumplimos el tiempo objetivo de solución de los tickets críticos?",
  "q:p1": "¿Quién autoriza una devolución de 12,000 pesos?", "q:p2": "¿Cuál es la tolerancia de merma en panadería?", "q:p3": "¿Puedo darle el teléfono de un colaborador a un proveedor?",
};
const MENU = {
  ventas: { titulo: "<b>💰 Ventas</b> — toca una pregunta o escribe la tuya:", botones: [{ text: BOTONES["q:v1"], callback_data: "q:v1" }, { text: BOTONES["q:v2"], callback_data: "q:v2" }, { text: BOTONES["q:v3"], callback_data: "q:v3" }] },
  inventario: { titulo: "<b>📦 Inventario</b> — toca una pregunta o escribe la tuya:", botones: [{ text: BOTONES["q:i1"], callback_data: "q:i1" }, { text: BOTONES["q:i2"], callback_data: "q:i2" }, { text: BOTONES["q:i3"], callback_data: "q:i3" }] },
  tickets: { titulo: "<b>🎫 Tickets</b> — toca una pregunta o escribe la tuya:", botones: [{ text: BOTONES["q:t1"], callback_data: "q:t1" }, { text: BOTONES["q:t2"], callback_data: "q:t2" }, { text: BOTONES["q:t3"], callback_data: "q:t3" }] },
  politicas: { titulo: "<b>📄 Políticas</b> — toca una pregunta o escribe la tuya:", botones: [{ text: BOTONES["q:p1"], callback_data: "q:p1" }, { text: BOTONES["q:p2"], callback_data: "q:p2" }, { text: BOTONES["q:p3"], callback_data: "q:p3" }] },
};
const SECCIONES = { inline_keyboard: [[{ text: "💰 Ventas", callback_data: "menu:ventas" }, { text: "📦 Inventario", callback_data: "menu:inventario" }], [{ text: "🎫 Tickets", callback_data: "menu:tickets" }, { text: "📄 Políticas", callback_data: "menu:politicas" }]] };

const nodes = [
  { id: "t", name: "Telegram Trigger", type: "n8n-nodes-base.telegramTrigger", typeVersion: 1.2, position: [0, 0], webhookId: "heb-aristo-telegram",
    // Sin "Restrict to User IDs" en el trigger: en n8n 2.33.x ese filtro descarta los callback_query (issue n8n #26795, fix #27643
    // sin fusionar). La allowlist se aplica en "Normalizar" para mensajes y botones por igual.
    parameters: { updates: ["message", "callback_query"], additionalFields: {} }, credentials: TG },
  code("nz", "Normalizar", [120, 0], [
    "// Unifica un mensaje y un toque de boton inline (callback_query) en la misma forma: { message, boton, callback_id }.",
    "const u = $input.first().json; const cb = u.callback_query;",
    "const BOTONES = " + JSON.stringify(BOTONES) + ";",
    "// Bot PUBLICO (los datos son sinteticos): sin allowlist. El limite de ritmo por chat esta en 'Limite por chat'.",
    "if (cb) {",
    "  return [{ json: { message: { ...cb.message, text: BOTONES[cb.data] ?? '', voice: undefined, audio: undefined, from: cb.from }, boton: cb.data, callback_id: cb.id } }];",
    "}",
    "return [{ json: { message: u.message, boton: null, callback_id: null } }];" ]),
  { id: "eb", name: "Es botón", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [360, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.callback_id ?? '' }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] }, looseTypeValidation: true } },
  { id: "dd", name: "Registrar callback", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [600, -220], alwaysOutputData: true, onError: "continueRegularOutput",
    // Dedupe: n8n puede disparar el trigger varias veces por un mismo callback (issue n8n #15483). Solo la primera inserta.
    parameters: { operation: "executeQuery", query: "CREATE TABLE IF NOT EXISTS telegram_callbacks (id text PRIMARY KEY, creado_en timestamptz DEFAULT now());\nINSERT INTO telegram_callbacks (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id;", options: { queryReplacement: "={{ $json.callback_id }}" } }, credentials: PG },
  { id: "cbn", name: "Callback nuevo", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [840, -220],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.id ?? '' }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] }, looseTypeValidation: true } },
  { id: "acq", name: "Confirmar botón", type: "n8n-nodes-base.telegram", typeVersion: 1.2, position: [1080, -220], onError: "continueRegularOutput",
    parameters: { resource: "callback", operation: "answerQuery", queryId: "={{ $('Normalizar').first().json.callback_id }}" }, credentials: TG },
  code("rn", "Reponer normalizado", [1320, -220], ["return [{ json: $('Normalizar').first().json }];"]),
  { id: "v", name: "Es voz", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1560, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: "c", leftValue: "={{ $json.message.voice?.file_id ?? $json.message.audio?.file_id ?? '' }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] }, looseTypeValidation: true } },
  { id: "f", name: "Descargar audio", type: "n8n-nodes-base.telegram", typeVersion: 1.2, position: [480, -140],
    parameters: { resource: "file", operation: "get", fileId: "={{ $json.message.voice?.file_id ?? $json.message.audio?.file_id }}", download: true }, credentials: TG },
  { id: "w", name: "Transcribir (Whisper)", type: "@n8n/n8n-nodes-langchain.openAi", typeVersion: 2.3, position: [720, -140],
    parameters: { resource: "audio", operation: "transcribe", binaryPropertyName: "data", options: { language: "es" } }, credentials: OPENAI },
  code("tx", "Texto de voz", [960, -140], ["return [{ json: { texto: String($json.text ?? '').trim(), es_voz: true } }];"]),
  code("tt", "Texto escrito", [480, 140], ["return [{ json: { texto: String($json.message.text ?? '').trim(), es_voz: false } }];"]),
  { id: "h", name: "Hash del chat", type: "n8n-nodes-base.crypto", typeVersion: 2, position: [1200, 0],
    parameters: { type: "SHA256", value: "={{ $('Normalizar').first().json.message.chat.id + ':' + '" + env.TELEGRAM_SAL + "' }}", dataPropertyName: "chat_hash" } },
  { id: "lim", name: "Límite por chat", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [1320, 0], alwaysOutputData: true, onError: "continueRegularOutput",
    // Bot publico: sin esto, cualquiera puede quemar la cuota del proveedor. 12 mensajes por 5 minutos y por chat.
    parameters: { operation: "executeQuery", query: "CREATE TABLE IF NOT EXISTS telegram_ritmo (chat_hash text, creado_en timestamptz DEFAULT now());\nINSERT INTO telegram_ritmo (chat_hash) VALUES ($1);\nDELETE FROM telegram_ritmo WHERE creado_en < now() - interval '1 hour';\nSELECT count(*)::int AS en_ventana FROM telegram_ritmo WHERE chat_hash = $1 AND creado_en > now() - interval '5 minutes';",
      options: { queryReplacement: "={{ $json.chat_hash }}" } }, credentials: PG },
  code("lim2", "Pasa el límite", [1380, 0], [
    "const h = $('Hash del chat').first().json; const n = Number($input.first().json?.en_ventana ?? 0);",
    "return [{ json: { ...h, sobre_limite: n > 12 } }];" ]),
  { id: "ls", name: "Leer sesión", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [1440, 0], alwaysOutputData: true, onError: "continueRegularOutput",
    parameters: { operation: "executeQuery", query: "SELECT ultimo_response_id FROM heb_sesiones WHERE chat_hash = $1", options: { queryReplacement: "={{ $json.chat_hash }}" } }, credentials: PG },
  code("p", "Preparar llamada", [1680, 0], [
    "// Une texto, hash y sesion. /nueva reinicia. Sin texto (sticker, foto) -> aviso.",
    "const h = $('Hash del chat').first().json;",
    "const fila = $input.first().json ?? {};",
    "const texto = String(h.texto ?? '').trim();",
    "const sobre_limite = !!$('Pasa el límite').first().json.sobre_limite;",
    "// Comandos y los botones del teclado persistente (mandan texto al tocarlos).",
    "const reinicio = /^\\/(nueva|start|reset)\\b/i.test(texto) || /^🆕/.test(texto);",
    "const ayuda = /^\\/(start|ayuda|help)\\b/i.test(texto) || /^❓/.test(texto) ? 'ayuda' : /^\\/ejemplos\\b/i.test(texto) || /^💡/.test(texto) ? 'ejemplos' : null;",
    "const menu = /^menu:(ventas|inventario|tickets|politicas)$/.test(texto) ? texto.slice(5) : null;",
    "return [{ json: { texto, es_voz: !!h.es_voz, chat_hash: h.chat_hash, reinicio, sobre_limite, ayuda: ayuda || (menu ? 'menu' : null), menu, sin_texto: texto.length === 0 || sobre_limite,",
    "  previous_response_id: reinicio ? null : (fila.ultimo_response_id ?? null) } }];" ]),
  { id: "r", name: "Reinicio o vacío", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1920, 0],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "or",
      conditions: [{ id: "a", leftValue: "={{ $json.reinicio }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } },
                   { id: "c", leftValue: "={{ $json.ayuda ?? '' }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } },
                   { id: "b", leftValue: "={{ $json.sin_texto }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }] }, looseTypeValidation: true } },
  code("x", "Preguntar a HEB-aristo", [2160, 120], [
    "// Llama al chat y, mientras responde, reenvia 'escribiendo…' cada 4 s (Telegram lo apaga a los 5 s; las respuestas tardan",
    "// 15-150 s). Un solo nodo: la llamada y el bucle corren en paralelo. Errores -> { status: 'error', code } como antes.",
    "const p = $('Preparar llamada').first().json; const chatId = $('Normalizar').first().json.message.chat.id;",
    "const TG = 'https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendChatAction';",
    "const escribiendo = () => this.helpers.httpRequest({ method: 'POST', url: TG, body: { chat_id: chatId, action: 'typing' }, json: true }).catch(() => null);",
    "let listo = false;",
    "const llamada = this.helpers.httpRequest({ method: 'POST', url: '" + CHAT_URL + "', body: { input: p.texto, previous_response_id: p.previous_response_id }, json: true, timeout: 180000, ignoreHttpStatusErrors: true })",
    "  .then((r) => (typeof r === 'string' ? JSON.parse(r) : r)).catch((e) => ({ status: 'error', code: 'upstream', respuesta: String(e.message || e) })).finally(() => { listo = true; });",
    "(async () => { while (!listo) { await escribiendo(); await new Promise((r) => setTimeout(r, 4000)); } })();",
    "const r = await llamada;",
    "return [{ json: r }];" ]),
  code("o", "Redactar respuesta", [2400, 120], [
    "// Traduce la respuesta del webhook a un mensaje de Telegram (HTML legible). Nunca silencio.",
    formato,
    "const p = $('Preparar llamada').first().json; const r = $input.first().json ?? {};",
    "let texto;",
    "if (r.status === 'completed' && r.respuesta) texto = r.respuesta;",
    "else if (r.code === 'previous_response_not_found') texto = 'La conversación anterior caducó. Empiezo una nueva: repíteme la pregunta.';",
    "else if (r.code === 'rate_limited') texto = 'Demasiadas preguntas seguidas; dame unos segundos.';",
    "else if (r.code === 'conversation_too_long') texto = 'Esta conversación ya es muy larga. Escribe /nueva para empezar otra.';",
    "else texto = 'No pude responder ahora (' + (r.code || 'error') + '). Intenta de nuevo en un momento.';",
    "// Markdown del modelo -> HTML de Telegram (negrita, viñetas •, citas en cursiva, sin tablas), tope 4000.",
    "texto = telegramHtml(texto);",
    "const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
    "if (p.es_voz) texto = '<blockquote>🎙️ ' + esc(p.texto.length > 160 ? p.texto.slice(0, 157) + '…' : p.texto) + '</blockquote>\\n' + texto;",
    "const reinicio = r.code === 'previous_response_not_found' || r.code === 'conversation_too_long';",
    "// Botones de seguimiento, deterministas por lo que trae la respuesta (cifra, cita de documento, tickets).",
    "const b = []; const t = String(r.respuesta ?? '');",
    "if (r.status === 'completed') {",
    "  if (/\\$\\s?\\d|unidades/.test(t)) b.push({ text: '🏬 Por tienda', callback_data: 'sig:tienda' }, { text: '📅 Por mes', callback_data: 'sig:mes' });",
    "  if (/\\.pdf/.test(t)) b.push({ text: '📄 Sección completa', callback_data: 'sig:sec' }, { text: '🔗 Documentos relacionados', callback_data: 'sig:docs' });",
    "  if (/ticket|folio/i.test(t) && !/\\.pdf/.test(t)) b.push({ text: '🎫 Detalle de tickets', callback_data: 'sig:tk' });",
    "  if (/\\$\\s?\\d/.test(t) && !/devoluci/i.test(t)) b.push({ text: '↩️ Devoluciones', callback_data: 'sig:dev' });",
    "}",
    "// No repetir el boton que la gerente acaba de tocar (ni su opuesto): ofrecer siempre algo distinto.",
    "const tocado = $('Normalizar').first().json.boton;",
    "const b2 = b.filter((x) => x.callback_data !== tocado);",
    "const teclado = b2.length ? { inline_keyboard: [b2.slice(0, 2), b2.slice(2, 4)].filter((f) => f.length) } : null;",
    "return [{ json: { texto, response_id: r.response_id ?? null, chat_hash: p.chat_hash, guardar: !!r.response_id || reinicio, reinicio, teclado } }];" ]),
  { id: "g", name: "Guardar sesión", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [2640, 120], onError: "continueRegularOutput",
    parameters: { operation: "executeQuery", query: "INSERT INTO heb_sesiones (chat_hash, ultimo_response_id, actualizado_en) VALUES ($1, NULLIF($2, '-'), now()) ON CONFLICT (chat_hash) DO UPDATE SET ultimo_response_id = EXCLUDED.ultimo_response_id, actualizado_en = now()",
      // '-' = reiniciar (n8n descarta un parametro vacio y la consulta fallaba en silencio: el reset no reseteaba).
      options: { queryReplacement: "={{ $json.chat_hash }},{{ $json.reinicio || !$json.response_id ? '-' : $json.response_id }}" } }, credentials: PG },
  code("rv", "Mensaje de reinicio", [2160, -140], [
    "const p = $json;",
    "const AYUDA = " + AYUDA + ", EJEMPLOS = " + EJEMPLOS + ";",
    "const MENU = " + JSON.stringify(MENU) + ", SECCIONES = " + JSON.stringify(SECCIONES) + ";",
    "let texto, teclado = null;",
    "if (p.menu) { texto = MENU[p.menu].titulo; teclado = { inline_keyboard: MENU[p.menu].botones.map((x) => [x]) }; }",
    "else if (p.ayuda === 'ayuda') { texto = AYUDA; teclado = SECCIONES; }",
    "else if (p.ayuda === 'ejemplos') { texto = EJEMPLOS; teclado = SECCIONES; }",
    "else if (p.sobre_limite) texto = 'Vas muy rápido: espera un par de minutos y vuelve a preguntar.';",
    "else texto = p.sin_texto ? 'Solo entiendo texto o notas de voz. ¿Qué quieres saber de tus tiendas?' : 'Listo, empezamos de cero. ¿Qué quieres saber?';",
    "return [{ json: { texto, response_id: null, chat_hash: p.chat_hash, reinicio: p.reinicio, guardar: p.reinicio, teclado } }];" ]),
  { id: "s", name: "Enviar por Telegram", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [2880, 0], onError: "continueRegularOutput",
    // HTTP directo a la Bot API: el nodo Telegram fija el reply_markup por nodo y aqui es dinamico (botones inline o teclado persistente).
    // El token va en la URL; exportar-flujos.mjs lo enmascara como <TELEGRAM_BOT_TOKEN>.
    parameters: { method: "POST", url: "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", sendBody: true, specifyBody: "json",
      jsonBody: "={{ (() => { const m = $('Redactar respuesta').isExecuted ? $('Redactar respuesta').first().json : $('Mensaje de reinicio').first().json; return JSON.stringify({ chat_id: $('Normalizar').first().json.message.chat.id, text: m.texto, parse_mode: 'HTML', reply_markup: m.teclado || { keyboard: [[{ text: '🆕 Nueva conversación' }, { text: '❓ Ayuda' }, { text: '💡 Ejemplos' }]], resize_keyboard: true } }); })() }}", options: { timeout: 30000 } } },
  { id: "s_nodo", name: "Enviar (nodo Telegram, inactivo)", type: "n8n-nodes-base.telegram", typeVersion: 1.2, position: [2880, 300], disabled: true,
    parameters: { chatId: "={{ $('Telegram Trigger').first().json.message.chat.id }}", text: "={{ $('Redactar respuesta').isExecuted ? $('Redactar respuesta').first().json.texto : $('Mensaje de reinicio').first().json.texto }}", additionalFields: { appendAttribution: false, parse_mode: "HTML" },
      // Teclado persistente: lo mas cercano a un boton nativo de "nueva conversacion" para alguien no tecnico.
      replyMarkup: "replyKeyboard", replyKeyboard: { rows: [{ row: { buttons: [{ text: "🆕 Nueva conversación" }, { text: "❓ Ayuda" }, { text: "💡 Ejemplos" }] } }] }, replyKeyboardOptions: { resize_keyboard: true } }, credentials: TG },
  { id: "nota", name: "Nota", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -420], parameters: { color: 4, width: 900, height: 300, content: [
    "## HEB-aristo — Telegram (canal principal para la evaluación)", "",
    "Adaptador delgado: no toca *Recuperación*, la llama por su webhook. Texto o **nota de voz** (Get File → OpenAI Transcribe `whisper-1`, español).", "",
    "**Datos personales**: el bot es **público** (los datos son sintéticos); la sesión se guarda en `heb_sesiones` por **hash SHA-256 del chat_id + sal**,",
    "nunca el id, nombre ni usuario de Telegram. `/nueva` reinicia. Los errores del webhook (caducó, límite, caída) se contestan con una frase.", "",
    "Se regenera con `node infra/crear-telegram.mjs` (la sal y la allowlist vienen de `.env`; el JSON exportado las lleva enmascaradas)." ].join("\n") } },
];
const connections = {
  "Telegram Trigger": { main: [[{ node: "Normalizar", type: "main", index: 0 }]] },
  "Normalizar": { main: [[{ node: "Es botón", type: "main", index: 0 }]] },
  "Es botón": { main: [[{ node: "Registrar callback", type: "main", index: 0 }], [{ node: "Es voz", type: "main", index: 0 }]] },
  "Registrar callback": { main: [[{ node: "Callback nuevo", type: "main", index: 0 }]] },
  "Callback nuevo": { main: [[{ node: "Confirmar botón", type: "main", index: 0 }], []] },
  "Confirmar botón": { main: [[{ node: "Reponer normalizado", type: "main", index: 0 }]] },
  "Reponer normalizado": { main: [[{ node: "Es voz", type: "main", index: 0 }]] },
  "Es voz": { main: [[{ node: "Descargar audio", type: "main", index: 0 }], [{ node: "Texto escrito", type: "main", index: 0 }]] },
  "Descargar audio": { main: [[{ node: "Transcribir (Whisper)", type: "main", index: 0 }]] },
  "Transcribir (Whisper)": { main: [[{ node: "Texto de voz", type: "main", index: 0 }]] },
  "Texto de voz": { main: [[{ node: "Hash del chat", type: "main", index: 0 }]] },
  "Texto escrito": { main: [[{ node: "Hash del chat", type: "main", index: 0 }]] },
  "Hash del chat": { main: [[{ node: "Límite por chat", type: "main", index: 0 }]] },
  "Límite por chat": { main: [[{ node: "Pasa el límite", type: "main", index: 0 }]] },
  "Pasa el límite": { main: [[{ node: "Leer sesión", type: "main", index: 0 }]] },
  "Leer sesión": { main: [[{ node: "Preparar llamada", type: "main", index: 0 }]] },
  "Preparar llamada": { main: [[{ node: "Reinicio o vacío", type: "main", index: 0 }]] },
  "Reinicio o vacío": { main: [[{ node: "Mensaje de reinicio", type: "main", index: 0 }], [{ node: "Preguntar a HEB-aristo", type: "main", index: 0 }]] },
  "Preguntar a HEB-aristo": { main: [[{ node: "Redactar respuesta", type: "main", index: 0 }]] },
  "Redactar respuesta": { main: [[{ node: "Guardar sesión", type: "main", index: 0 }]] },
  "Mensaje de reinicio": { main: [[{ node: "Guardar sesión", type: "main", index: 0 }]] },
  "Guardar sesión": { main: [[{ node: "Enviar por Telegram", type: "main", index: 0 }]] },
};
const NOMBRE = "HEB-aristo — Telegram";
const lista = (await api("GET", "/workflows?limit=250")).data;
const ya = lista.find((w) => w.name === NOMBRE);
const cuerpo = { name: NOMBRE, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Monterrey" } };
const w = ya ? await api("PUT", "/workflows/" + ya.id, cuerpo) : await api("POST", "/workflows", cuerpo);
if (!w.active) await api("POST", "/workflows/" + w.id + "/activate").catch((e) => { if (!/already|active|too many/i.test(e.message)) throw e; });
console.log((ya ? "Actualizado " : "Creado ") + w.name + " id=" + w.id + " activo");
const tg = async (m, body) => (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
console.log("comandos:", (await tg("setMyCommands", { commands: [{ command: "ayuda", description: "Qué puedo hacer y cómo preguntarme" }, { command: "ejemplos", description: "Preguntas de ejemplo" }, { command: "nueva", description: "Empezar una conversación desde cero" }] })).ok,
  "| descripcion:", (await tg("setMyDescription", { description: "Asistente de gerencia H-E-B: cifras de ventas, inventario y tickets de tus tiendas, y políticas internas con su fuente. Pregunta por texto o nota de voz." })).ok,
  "| about:", (await tg("setMyShortDescription", { short_description: "Cifras y políticas de tus tiendas, en español." })).ok);
