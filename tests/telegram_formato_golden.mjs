// Golden test del conversor de Telegram con RESPUESTAS REALES (ultimas N de heb_turnos). No llama a Telegram.
// Invariantes: solo etiquetas permitidas, balanceadas, texto sin etiquetas identico al original (modulo
// vinetas/encabezados), <= 4096 caracteres, idempotente. Uso: node tests/telegram_formato_golden.mjs [n=40]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const { telegramHtml, EMOJIS } = createRequire(import.meta.url)("../infra/telegram_formato.js");
// Los emojis los agrega el conversor a proposito: se quitan antes de comparar el texto.
const sinEmoji = (s) => { for (const [, e] of EMOJIS) s = s.split(e + " ").join(""); return s; };
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const N = Number(process.argv[2] || 40);
const raw = execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST,
  `docker exec bano_postgres psql -U bano -d bano -tA -c "select json_agg(salida) from (select salida from heb_turnos where salida is not null and length(salida) > 40 order by creado_en desc limit ${N}) s"`], { encoding: "utf8" });
const respuestas = JSON.parse(raw.trim() || "[]");
const PERMITIDAS = new Set(["b", "i", "u", "s", "code", "pre", "a", "blockquote"]);
const texto = (s) => sinEmoji(s.replace(/<[^>]+>/g, "")).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
// Lo que el conversor cambia a proposito en el texto: vinetas, encabezados, tablas, guiones.
const normal = (s) => s.replace(/[‐‑‒–−]/g, "-").replace(/^\s*#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "").replace(/^\s{2,}[-*]\s+/gm, "")
  .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ").replace(/\*\*|__|`/g, "").replace(/^\s*\|[\s-:|]+\|\s*$/gm, "").replace(/^\s*\|(.*)\|\s*$/gm, (m, c) => c.split("|").map((x) => x.trim()).join(" — "))
  .replace(/\r/g, "").replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n").trim();
let fallos = 0; const detalle = [];
for (const [i, r] of respuestas.entries()) {
  const h = telegramHtml(r);
  const errores = [];
  const tags = [...h.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[1]);
  for (const t of new Set(tags)) if (!PERMITIDAS.has(t)) errores.push("etiqueta no permitida <" + t + ">");
  const pila = [];
  for (const m of h.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) { if (m[1]) { if (pila.pop() !== m[2]) errores.push("desbalance en </" + m[2] + ">"); } else pila.push(m[2]); }
  if (pila.length) errores.push("sin cerrar: " + pila.join(","));
  const a = normal(texto(h)).replace(/^• |^   ◦ /gm, "").replace(/\n{2,}/g, "\n").replace(/…$/, "");
  const b = normal(r).replace(/\n{2,}/g, "\n").slice(0, a.length);
  if (a !== b && !(r.length > 3990)) errores.push("texto alterado en pos " + [...a].findIndex((c, k) => c !== b[k]));
  if (h.length > 4096) errores.push("excede 4096");
  if (telegramHtml(texto(h)) !== telegramHtml(texto(telegramHtml(texto(h))))) errores.push("no idempotente");
  if (errores.length) { fallos++; detalle.push({ i, errores, original: r.slice(0, 300), html: h.slice(0, 300) }); }
}
mkdirSync("resultados", { recursive: true });
writeFileSync("resultados/telegram_formato_golden.json", JSON.stringify({ n: respuestas.length, fallos, detalle }, null, 1));
console.log(`golden telegram_formato: ${respuestas.length - fallos}/${respuestas.length} respuestas reales sin invariantes rotos` + (fallos ? " -> resultados/telegram_formato_golden.json" : ""));
for (const d of detalle.slice(0, 5)) console.log("  #" + d.i, d.errores.join("; "), "\n     ", d.original.replace(/\n/g, "⏎").slice(0, 160));
process.exit(fallos ? 1 : 0);
