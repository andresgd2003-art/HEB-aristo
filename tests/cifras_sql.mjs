// Gate de cifras (ticket 04, consolidado en el 12): 11 preguntas cuya verdad se calcula con SQL escrito a
// mano, independiente del que genera el modelo. Pega al webhook del chat (el agente SQL vive dentro de
// Recuperación desde la etapa 1 del ticket 12). Pasa si el numero esperado aparece en la respuesta.
//
// Uso: node tests/cifras_sql.mjs [corridas=1]   (ssh al VPS para la verdad)
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const URL = env.N8N_BASE_URL + (env.CHAT_PATH || "/webhook/heb-aristo/chat");
const VARIANTE = "chat", CORRIDAS = Number(process.argv[2] || 1);

// [pregunta, SQL de verdad (una fila, una columna), tolerancia relativa]
const CASOS = [
  ["¿Cuánto vendió la tienda T02 en julio de 2026?",
   "select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31'"],
  ["¿Cuál fue la venta neta total de las cuatro tiendas en el trimestre?",
   "select round(sum(venta_neta_mxn),2) from heb.ventas"],
  ["¿Cuántos productos están por debajo de su punto de reorden en Tienda Valle Norte?",
   "select count(*) from heb.inventario where tienda_id='T01' and existencia < punto_reorden"],
  ["¿Cuántos tickets siguen abiertos o en proceso en total?",
   "select count(*) from heb.tickets_mesa_servicio where estado in ('Abierto','En proceso')"],
  ["¿Cuántas unidades de leche entera se vendieron en todo el periodo, contando la presentación nueva?",
   "select sum(unidades) from heb.ventas where sku in ('SKU-1001','SKU-1121')"],
  ["¿Cuánto se vendió por Ecommerce en agosto de 2026?",
   "select round(sum(venta_neta_mxn),2) from heb.ventas where canal='Ecommerce' and fecha between '2026-08-01' and '2026-08-31'"],
  ["¿Cuántos productos perecederos caducan antes del 15 de septiembre de 2026 en todas las tiendas?",
   "select count(*) from heb.inventario where fecha_caducidad_lote_proximo < '2026-09-15'"],
  ["¿Cuál es la categoría con mayor venta neta en T03?",
   "select c.categoria from heb.ventas v join heb.catalogo_productos c on c.sku=v.sku where v.tienda_id='T03' group by 1 order by sum(v.venta_neta_mxn) desc limit 1"],
  ["¿Cuántos tickets de prioridad Crítica se levantaron en el periodo?",
   "select count(*) from heb.tickets_mesa_servicio where prioridad='Crítica'"],
  ["¿Cuántos tickets abiertos o en proceso hay por tienda entre junio y agosto de 2026? Dame el de T02.",
   "select count(*) from heb.tickets_mesa_servicio where tienda_id='T02' and estado in ('Abierto','En proceso')"],
  ["¿Cuál fue el monto total de devoluciones (unidades negativas) en junio de 2026?",
   "select round(sum(venta_neta_mxn),2) from heb.ventas where unidades<0 and fecha between '2026-06-01' and '2026-06-30'"],
];

const verdad = (sql) => execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, `docker exec bano_postgres psql -U bano -d bano -tA -c "${sql.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();

let ok = 0, total = 0, msTotal = 0;
const verdades = CASOS.map(([, v]) => verdad(v));
for (let c = 1; c <= CORRIDAS; c++) for (const [k, [pregunta]] of CASOS.entries()) {
  const esperado = verdades[k]; total++;
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: pregunta }) });
  const j = await r.json().catch(() => ({}));
  const ms = Date.now() - t0; msTotal += ms;
  // El numero esperado (en valor absoluto: las devoluciones pueden mostrarse en positivo) o el texto debe aparecer en la respuesta.
  const texto = String(j.respuesta ?? "").replace(/[‐‑‒–−]/g, "-");
  const num = Number(esperado);
  const hit = Number.isFinite(num)
    ? [...texto.matchAll(/-?\$?\s?\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(Math.abs(Number(m[0].replace(/[^0-9.-]/g, ""))) - Math.abs(num)) <= Math.max(0.01, Math.abs(num) * 0.001))
    : texto.toLowerCase().includes(esperado.toLowerCase());
  ok += hit ? 1 : 0;
  console.log((hit ? "OK " : "XX ") + "[" + VARIANTE + " c" + c + "] " + pregunta + "\n     esperado=" + esperado + " | filas=" + (j.n ?? "?") + " | " + ms + " ms" + (hit ? "" : "\n     sql=" + j.sql + "\n     fila0=" + JSON.stringify(j.filas?.[0] ?? j)));
}
console.log(`\n${ok}/${CASOS.length}`);
process.exit(ok === CASOS.length ? 0 : 1);
