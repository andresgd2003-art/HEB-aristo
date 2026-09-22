// Exporta los dos flujos vivos (Ingesta y Chat) a workflows/*.json. Uso: node infra/exportar-flujos.mjs
import { readFileSync, existsSync, writeFileSync } from "node:fs";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const API = env.N8N_BASE_URL.replace(/\/$/, "") + "/api/v1", H = { "X-N8N-API-KEY": env.N8N_API_KEY };
const FLUJOS = { chat: "HEB-aristo — Chat", ingesta: "HEB-aristo — Ingesta del corpus", telegram: "HEB-aristo — Telegram" };
const lista = (await (await fetch(API + "/workflows?limit=250", { headers: H })).json()).data;
for (const [k, nombre] of Object.entries(FLUJOS)) {
  const w = lista.find((x) => x.name === nombre); if (!w) { console.error("No existe:", nombre); process.exit(1); }
  const full = await (await fetch(API + "/workflows/" + w.id, { headers: H })).json();
  const { timezone, executionOrder } = full.settings || {};
  let json = JSON.stringify({ name: full.name, nodes: full.nodes, connections: full.connections, settings: JSON.parse(JSON.stringify({ timezone, executionOrder })) }, null, 2);
  // Telegram: la sal del hash y la allowlist no van al repo; infra/crear-telegram.mjs las pone desde .env.
  if (k === "telegram") { if (env.TELEGRAM_SAL) json = json.split(env.TELEGRAM_SAL).join("<TELEGRAM_SAL>"); if (env.TELEGRAM_USER_IDS) json = json.split(env.TELEGRAM_USER_IDS).join("<TELEGRAM_USER_IDS>"); if (env.TELEGRAM_BOT_TOKEN) json = json.split(env.TELEGRAM_BOT_TOKEN).join("<TELEGRAM_BOT_TOKEN>"); }
  writeFileSync(`workflows/heb-aristo-${k}.json`, json);
  console.log(`${nombre}: ${full.nodes.length} nodos -> workflows/heb-aristo-${k}.json`);
}
