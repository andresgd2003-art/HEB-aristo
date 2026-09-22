// Prueba de punta a punta de los botones de Telegram (ticket 20) SIN tocar el telefono: inyecta updates reales al webhook
// del trigger (con el secreto que n8n deriva: <workflowId>_<nodeId>) y lee la ejecucion resultante. Cada boton debe
// producir: una ejecucion, callback confirmado, dedupe (el mismo callback_id dos veces = una sola respuesta) y un
// sendMessage al chat. Uso: node tests/telegram_botones.mjs   (lee .env; manda mensajes reales a tu chat de Telegram)
import { readFileSync, existsSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY };
const WF = "6n0dFBN8QdGwUf2H", NODO = "t", SECRETO = `${WF}_${NODO}`, UID = Number(String(env.TELEGRAM_USER_IDS).split(",")[0]);
const hook = API + "/webhook/heb-aristo-telegram/webhook";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ultimaExec = async () => (await (await fetch(API + "/api/v1/executions?workflowId=" + WF + "&limit=1&includeData=true", { headers: H })).json()).data[0];
async function update(body) {
  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRETO }, body: JSON.stringify({ update_id: Date.now(), ...body }) });
  return r.status;
}
const msg = (text) => ({ message: { message_id: 1, from: { id: UID, is_bot: false, first_name: "A" }, chat: { id: UID, type: "private" }, date: Math.floor(Date.now() / 1000), text } });
const cb = (data, id = "t" + Date.now()) => ({ callback_query: { id, from: { id: UID, is_bot: false, first_name: "A" }, message: { message_id: 1, chat: { id: UID, type: "private" }, date: 1, text: "x" }, chat_instance: "1", data } });
async function caso(nombre, body, checks, esperaMs = 25000) {
  const antes = (await ultimaExec())?.id;
  const st = await update(body);
  let e; for (let i = 0; i < esperaMs / 2500; i++) { await espera(2500); e = await ultimaExec(); if (e && e.id !== antes && e.status !== "running") break; }
  const rd = e?.data?.resultData?.runData ?? {};
  const ran = (n) => (rd[n] ?? []).length;
  const env_ = rd["Enviar por Telegram"]?.[0]?.data?.main?.[0]?.[0]?.json;
  const chat = rd["Preguntar a HEB-aristo"]?.[0]?.data?.main?.[0]?.[0]?.json;
  const ok = checks({ st, e, ran, env_, rd, chat });
  console.log((ok ? "OK " : "XX ") + nombre + ` | http ${st} | exec ${e?.id ?? "-"} ${e?.status ?? ""} | nodos: Normalizar ${ran("Normalizar")}, Confirmar ${ran("Confirmar botón")}, Preguntar ${ran("Preguntar a HEB-aristo")}, Enviar ${ran("Enviar por Telegram")} | tg.ok=${env_?.ok} | chat=${chat?.status ?? "-"}`);
  if (!ok) console.log("     ", JSON.stringify(e?.data?.resultData?.error?.message ?? Object.entries(rd).filter(([, v]) => v.some((r) => r.error)).map(([k, v]) => k + ": " + v.find((r) => r.error).error.message)).slice(0, 400));
  return ok;
}
let ok = 0, n = 0;
const t = async (...a) => { n++; ok += (await caso(...a)) ? 1 : 0; };
await t("texto normal con cifra -> botones de seguimiento", msg("¿Cuánto vendió T02 en julio de 2026?"), ({ env_, chat }) => chat?.status === "completed" && env_?.ok === true && !!env_?.result?.reply_markup?.inline_keyboard, 120000);
await t("boton sig:tienda (memoria)", cb("sig:tienda"), ({ env_, ran, chat }) => ran("Confirmar botón") === 1 && chat?.status === "completed" && env_?.ok === true, 120000);
const dup = "dup" + Date.now();
await t("boton sig:mes (1a vez)", cb("sig:mes", dup), ({ env_, ran, chat }) => chat?.status === "completed" && env_?.ok === true, 120000);
await t("mismo callback repetido -> dedupe, sin segunda respuesta", cb("sig:mes", dup), ({ ran }) => ran("Preguntar a HEB-aristo") === 0 && ran("Enviar por Telegram") === 0, 20000);
await t("❓ Ayuda -> secciones", msg("❓ Ayuda"), ({ env_ }) => env_?.ok === true && env_?.result?.reply_markup?.inline_keyboard?.length === 2, 20000);
await t("menu:ventas -> 3 preguntas", cb("menu:ventas"), ({ env_ }) => env_?.ok === true && env_?.result?.reply_markup?.inline_keyboard?.length === 3, 20000);
await t("q:p1 (pregunta de politica) -> cita plegable", cb("q:p1"), ({ env_, chat }) => chat?.status === "completed" && env_?.ok === true && /expandable_blockquote|underline/.test(JSON.stringify(env_?.result?.entities ?? [])), 120000); // cita plegable (linea propia) o cita inline (archivo+seccion)
// Bot PUBLICO: un desconocido tambien recibe respuesta. Se verifica que el flujo llega al agente (el envio a Telegram
// falla porque ese chat no existe, y eso esta bien: lo que se mide es que ya no se filtra por id).
await t("usuario desconocido -> el bot responde (bot público)", { message: { message_id: 1, from: { id: 999000111, is_bot: false, first_name: "Desconocido" }, chat: { id: 999000111, type: "private" }, date: Math.floor(Date.now() / 1000), text: "¿Cuánto vendió T02 en julio de 2026?" } }, ({ ran, chat }) => ran("Normalizar") === 1 && chat?.status === "completed", 120000);
console.log(`\n${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
