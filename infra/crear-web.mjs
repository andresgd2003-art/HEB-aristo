// Ticket 14: flujo "HEB-aristo — Web (proxy)", calcado de "Portafolio — Proxy de chat a BANO".
//   Webhook publico (CORS solo al origen web) -> validar + rate-limit 8/min por IP (tabla chat_portafolio_rate)
//   -> si viene audio (multipart, campo `audio`): OpenAI Transcribe whisper-1 -> POST /heb-aristo/chat
//   -> {reply, reply_html, response_id, transcripcion}. Sin bearer en el navegador; errores neutros.
// Idempotente. Uso: node infra/crear-web.mjs
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, body) => { const r = await fetch(API + "/api/v1" + p, { method: m, headers: H, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(m + " " + p + " " + r.status + " " + JSON.stringify(j).slice(0, 400)); return j; };
const ORIGEN = env.WEB_ORIGEN || "https://heb.stingai.org";
// localhost:8765 solo para probar la pagina en local (`cd web && python -m http.server 8765`).
const ORIGENES = [ORIGEN, "http://localhost:8765"];
const OPENAI = { openAiApi: { id: "khGoYB8EqlxK66fW", name: "OpenAi account" } };
const PG = { postgres: { id: "V0RcqGuqWSuowyhM", name: "BANO Postgres (pgvector)" } };
const formato = readFileSync("infra/telegram_formato.js", "utf8").replace(/\nif \(typeof module[\s\S]*$/, "").replace(/^\/\/.*\n/gm, "");
const code = (id, name, pos, js) => ({ id, name, type: "n8n-nodes-base.code", typeVersion: 2, position: pos, parameters: { jsCode: js } });
const si200 = (id, name, pos) => ({ id, name, type: "n8n-nodes-base.if", typeVersion: 2.2, position: pos, parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and", conditions: [{ id: "c", leftValue: "={{ $json.__status }}", rightValue: 200, operator: { type: "number", operation: "equals" } }] } } });
const err = (status, codigo, message) => `return [{ json: { __status: ${status}, cuerpo: { error: { code: '${codigo}', message: '${message}' } } } }];`;

const nodes = [
  { id: "w", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "heb-aristo-web",
    parameters: { httpMethod: "POST", path: "heb-aristo/web/chat", responseMode: "responseNode", options: { allowedOrigins: ORIGENES.join(",") } } },
  code("v", "Validar", [240, 0], `// Texto (JSON) o audio (multipart, campo 'audio'). IP real = primer salto de x-forwarded-for.
const it = $input.first(); const body = it.json.body ?? {}; const h = it.json.headers ?? {};
const texto = String(body.input ?? '').trim(); const previous = typeof body.previous_response_id === 'string' ? body.previous_response_id : '';
const audio = it.binary?.audio ? 'audio' : '';
const ip = String(h['x-forwarded-for'] ?? '').split(',')[0].trim() || String(h['x-real-ip'] ?? '') || 'desconocida';
if (!texto && !audio) ${err(400, "empty", "Escribe o graba una pregunta.")}
if (texto.length > 2000) ${err(400, "too_long", "Máximo 2000 caracteres.")}
if (audio && Number(it.binary.audio.fileSize ?? 0) > 5 * 1024 * 1024) ${err(400, "too_large", "El audio no puede pasar de 5 MB.")}
return [{ json: { __status: 200, texto, previous, audio, ip }, binary: it.binary }];`),
  si200("p1", "Pasa validación", [480, 0]),
  { id: "r", name: "Registrar y contar por IP", type: "n8n-nodes-base.postgres", typeVersion: 2.6, position: [720, -100], credentials: PG,
    parameters: { operation: "executeQuery", query: "INSERT INTO chat_portafolio_rate (ip) VALUES ($1);\nSELECT count(*)::int AS en_el_minuto FROM chat_portafolio_rate WHERE ip = $1 AND creado_en > now() - interval '1 minute';", options: { queryReplacement: "={{ $json.ip }}" } } },
  code("d", "Decidir rate", [960, -100], `const prev = $('Validar').first(); const filas = $input.all();
const n = filas.length ? Number(filas[filas.length - 1].json.en_el_minuto ?? 0) : 0;
if (n > 8) ${err(429, "rate_limited", "Demasiados mensajes seguidos. Espera un momento.")}
return [{ json: { ...prev.json }, binary: prev.binary }];`),
  si200("p2", "Pasa rate", [1200, -100]),
  { id: "ev", name: "Es voz", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1440, -200], parameters: { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and", conditions: [{ id: "c", leftValue: "={{ $json.audio }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }] } } },
  { id: "t", name: "Transcribir (Whisper)", type: "@n8n/n8n-nodes-langchain.openAi", typeVersion: 2.3, position: [1680, -300], credentials: OPENAI,
    parameters: { resource: "audio", operation: "transcribe", binaryPropertyName: "audio", options: { language: "es" } } },
  code("tx", "Texto de voz", [1920, -300], "const p = $('Decidir rate').first().json; return [{ json: { texto: String($json.text ?? '').trim(), previous: p.previous, es_voz: true } }];"),
  code("tt", "Texto escrito", [1680, -100], "return [{ json: { texto: $json.texto, previous: $json.previous, es_voz: false } }];"),
  { id: "c", name: "Llamar al chat", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [2160, -200], onError: "continueErrorOutput",
    parameters: { method: "POST", url: API + "/webhook/heb-aristo/chat", sendBody: true, specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.previous ? { input: $json.texto, previous_response_id: $json.previous } : { input: $json.texto }) }}", options: { timeout: 200000 } } },
  code("f", "Formatear respuesta", [2400, -300], formato + `
const r = $input.first().json;
const ent = $('Texto de voz').isExecuted ? $('Texto de voz').first().json : $('Texto escrito').first().json;
const texto = String(r.respuesta ?? '');
return [{ json: { __status: 200, cuerpo: { reply: texto, reply_html: telegramHtml(texto), response_id: r.status === 'error' ? '' : (r.response_id ?? ''), transcripcion: ent.es_voz ? ent.texto : '' } } }];`),
  code("e", "Error del chat", [2400, -100], err(503, "upstream", "El asistente no pudo responder ahora mismo. Inténtalo de nuevo en un momento.")),
  { id: "o", name: "Responder", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [2700, 0],
    parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json.cuerpo) }}", options: { responseCode: "={{ $json.__status }}", responseHeaders: { entries: [{ name: "Access-Control-Allow-Origin", value: "={{ " + JSON.stringify(ORIGENES) + ".includes($('Webhook').first().json.headers.origin) ? $('Webhook').first().json.headers.origin : " + JSON.stringify(ORIGEN) + " }}" }] } } } },
  { id: "n", name: "Nota", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -400], parameters: { width: 620, height: 240, content:
    "## Proxy web de HEB-aristo (ticket 14)\n\nCalcado del proxy del portafolio → BANO. Endpoint público para `" + ORIGEN + "`: CORS a ese origen, rate-limit 8/min por IP (tabla `chat_portafolio_rate`), 2000 caracteres, audio ≤ 5 MB.\n\nTexto: JSON `{input, previous_response_id}`. Voz: multipart con campo `audio` (webm/opus o mp4/aac, lo que dé el navegador) → Whisper (es) → mismo chat.\nDevuelve `{reply, reply_html, response_id, transcripcion}`; `reply_html` usa el MISMO conversor que Telegram (`infra/telegram_formato.js`).\n\nRegenerar: `node infra/crear-web.mjs`." } },
];
const connections = {
  Webhook: { main: [[{ node: "Validar", type: "main", index: 0 }]] },
  Validar: { main: [[{ node: "Pasa validación", type: "main", index: 0 }]] },
  "Pasa validación": { main: [[{ node: "Registrar y contar por IP", type: "main", index: 0 }], [{ node: "Responder", type: "main", index: 0 }]] },
  "Registrar y contar por IP": { main: [[{ node: "Decidir rate", type: "main", index: 0 }]] },
  "Decidir rate": { main: [[{ node: "Pasa rate", type: "main", index: 0 }]] },
  "Pasa rate": { main: [[{ node: "Es voz", type: "main", index: 0 }], [{ node: "Responder", type: "main", index: 0 }]] },
  "Es voz": { main: [[{ node: "Transcribir (Whisper)", type: "main", index: 0 }], [{ node: "Texto escrito", type: "main", index: 0 }]] },
  "Transcribir (Whisper)": { main: [[{ node: "Texto de voz", type: "main", index: 0 }]] },
  "Texto de voz": { main: [[{ node: "Llamar al chat", type: "main", index: 0 }]] },
  "Texto escrito": { main: [[{ node: "Llamar al chat", type: "main", index: 0 }]] },
  "Llamar al chat": { main: [[{ node: "Formatear respuesta", type: "main", index: 0 }], [{ node: "Error del chat", type: "main", index: 0 }]] },
  "Formatear respuesta": { main: [[{ node: "Responder", type: "main", index: 0 }]] },
  "Error del chat": { main: [[{ node: "Responder", type: "main", index: 0 }]] },
};
const NAME = "HEB-aristo — Web (proxy)";
const existente = (await api("GET", "/workflows?limit=200")).data.find((w) => w.name === NAME);
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Mexico_City" } };
const w = existente ? await api("PUT", "/workflows/" + existente.id, body) : await api("POST", "/workflows", body);
if (!w.active) await api("POST", "/workflows/" + w.id + "/activate");
console.log((existente ? "Actualizado " : "Creado ") + NAME + " id=" + w.id + " -> " + API + "/webhook/heb-aristo/web/chat");
