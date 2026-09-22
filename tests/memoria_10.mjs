// Una conversación de 10 turnos (la ventana completa de memoria), encadenada por previous_response_id.
// Cada turno depende del anterior (correferencia: "esa tienda", "ese día", "el segundo") y tiene verdad por SQL a mano
// o por regla del prompt. Mide: contexto entre turnos, regla 10 (no redactar) bajo presión de seguimiento, regla 11
// ("qué pasó" compara ventas antes de listar tickets), y el borde de la ventana (turno 10 pregunta por el turno 1).
// Uso: node tests/memoria_10.mjs   (ssh al VPS para la verdad)
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const URL = env.N8N_BASE_URL + (env.CHAT_PATH || "/webhook/heb-aristo/chat");
const sql = (q) => execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, `docker exec bano_postgres psql -U bano -d bano -tA -F '|' -c "${q.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
const num = (t, n, tol = 0.001) => [...t.matchAll(/-?\$?\s?\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(Math.abs(Number(m[0].replace(/[^0-9.-]/g, ""))) - Math.abs(n)) <= Math.max(0.01, Math.abs(n) * tol));

// Verdades
const [peorAgo, ventaPeor] = sql("select fecha, round(sum(venta_neta_mxn),2) from heb.ventas where fecha between '2026-08-01' and '2026-08-31' group by 1 order by 2 limit 1").split("|");
const menosTienda = sql(`select tienda_id, round(sum(venta_neta_mxn),2) from heb.ventas where fecha='${peorAgo}' group by 1 order by 2 limit 1`).split("|");
const reorden = sql(`select sku from heb.inventario where tienda_id='${menosTienda[0]}' and existencia < punto_reorden order by sku`).split("\n").filter(Boolean);
const segundoNombre = reorden[1] ? sql(`select nombre from heb.catalogo_productos where sku='${reorden[1]}'`) : "";
const t02_15jul = sql("select round(sum(venta_neta_mxn),2) from heb.ventas where fecha='2026-07-15' and tienda_id='T02'");
const t02_prom = sql("select round(sum(venta_neta_mxn)/count(distinct fecha),2) from heb.ventas where tienda_id='T02'");
// Dos lecturas validas: tickets de T02 ese dia ("esa misma tienda" sigue vigente) o de todas las tiendas. Ambas verdades por SQL.
const ticketsJul15 = sql("select count(*) from heb.tickets_mesa_servicio where fecha_creacion::date='2026-07-15' and tienda_id='T02'");
const ticketsJul15Todas = sql("select count(*) from heb.tickets_mesa_servicio where fecha_creacion::date='2026-07-15'");
const t02_15ago = sql("select round(sum(venta_neta_mxn),2) from heb.ventas where fecha='2026-08-15' and tienda_id='T02'");

const TURNOS = [
  ["¿Cuál fue el peor día de agosto en ventas, sumando las cuatro tiendas?", (t) => num(t, Number(ventaPeor)) && t.includes(peorAgo.slice(8)), "cifra + día"],
  ["¿Y qué tienda vendió menos ese día?", (t) => t.includes(menosTienda[0]) && num(t, Number(menosTienda[1])), "correferencia 'ese día' → tienda + cifra"],
  ["¿Qué productos hay que reordenar en esa tienda?", (t) => reorden.every((s) => t.includes(s)), `correferencia 'esa tienda' → ${reorden.length} SKU`],
  ["Hazme un correo para el proveedor con esos productos.", (t) => !/asunto:|subject:|estimad[oa]|dear /i.test(t) && (reorden.some((s) => t.includes(s)) || /lista|cifra|redact/i.test(t)), "regla 10: NO redacta, entrega lista"],
  ["Está bien, pero mándamelo en inglés.", (t) => !/subject:|dear |please/i.test(t), "regla 10 sostenida en seguimiento"],
  ["Cambiando de tema: ¿qué pasó con las ventas de T02 el 15 de julio?", (t) => num(t, Number(t02_15jul)) && /remodelaci|1118|41\s?%|40\s?%|ca[ií]da|por debajo|promedio/i.test(t), "regla 11: compara contra promedio + causa (ticket 1118)"],
  ["¿Y el 15 de agosto en esa misma tienda?", (t) => num(t, Number(t02_15ago)) && /pico|por encima|doble|alza|subi|aumento|↑|\d+\s?%/i.test(t) && /no hay|sin (ticket|causa)|no (encuentro|explica|tengo)|ninguna/i.test(t), "correferencia + pico sin causa: se abstiene"],
  ["¿Cuántos tickets hubo ese día, el de julio?", (t) => new RegExp("(^|[^\d])(" + ticketsJul15 + "|" + ticketsJul15Todas + ") tickets?").test(t) && /15 de julio|15-jul|2026-07-15|julio/.test(t), "correferencia doble ('ese día, el de julio') → tickets del 15-jul (T02 o todas)"],
  [`De los productos a reordenar que me diste, ¿cómo se llama el segundo?`, (t) => { // el segundo EN EL ORDEN QUE EL AGENTE DIO en el turno 3
      const orden = [...(res[2]?.respuesta ?? "").matchAll(/SKU-\d{4}/g)].map((m) => m[0]); const sku = orden[1]; if (!sku) return false;
      const nombre = sql(`select nombre from heb.catalogo_productos where sku='${sku}'`); return t.includes(sku) || t.toLowerCase().includes(nombre.toLowerCase().split(" ")[0]); }, "recuerda la lista del turno 3 (6 turnos atrás)"],
  ["¿Cuál fue la primera pregunta que te hice en esta conversación?", (t) => /peor d[ií]a|agosto/i.test(t), "borde de la ventana: turno 1 desde el turno 10"],
];

let prev = "", ok = 0; const res = [];
for (const [i, [pregunta, check, mide]] of TURNOS.entries()) {
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prev ? { input: pregunta, previous_response_id: prev } : { input: pregunta }) });
  const j = await r.json().catch(() => ({})); const texto = String(j.respuesta ?? ""); prev = j.response_id || prev;
  const hit = !!check(texto); ok += hit;
  res.push({ turno: i + 1, pregunta, mide, ok: hit, ms: Date.now() - t0, respuesta: texto });
  console.log((hit ? "OK " : "XX ") + `T${i + 1} [${mide}] ${pregunta} (${Date.now() - t0} ms)` + (hit ? "" : "\n     -> " + texto.slice(0, 400).replace(/\n/g, " ")));
}
mkdirSync("resultados", { recursive: true });
const fecha = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
writeFileSync(`resultados/memoria10_${fecha}.json`, JSON.stringify({ ok, total: TURNOS.length, verdades: { peorAgo, ventaPeor, menosTienda, reorden, segundoNombre, t02_15jul, t02_prom, t02_15ago, ticketsJul15 }, res }, null, 1));
console.log(`\n${ok}/${TURNOS.length} -> resultados/memoria10_${fecha}.json`);
process.exit(ok === TURNOS.length ? 0 : 1);
