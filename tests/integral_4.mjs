// Prueba integral: 4 conversaciones encadenadas (24 turnos) que recorren TODAS las funciones del agente.
// Cada turno depende del anterior dentro de su conversación (previous_response_id) y se verifica de forma determinista:
// cifra calculada por SQL a mano, cita esperada (archivo + sección) o regla de conducta (lo que NO debe aparecer).
//
//   A. Datos de ventas: total, correferencia doble, SKU sustituido, empates, no redactar, canal por formato de tienda.
//   B. Políticas: plazo con cita, contradicción FAQ vs procedimiento, autorización por monto, dato inexistente, PII.
//   C. Tickets y cumplimiento: qué pasó con causa, pico sin causa, SLA contra la política, estados, prioridad debida.
//   D. Inventario y política aplicada: reorden, derivada, retiro por caducidad, conteo por turno, fuera de periodo, memoria.
//
// Uso: node tests/integral_4.mjs           (CHAT_PATH=/webhook/heb-aristo/test/chat para medir el clon)
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2]; }
const URL_CHAT = env.N8N_BASE_URL + (env.CHAT_PATH || "/webhook/heb-aristo/chat");
const sql = (q) => execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, `docker exec bano_postgres psql -U bano -d bano -tA -F '|' -c "${q.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
const num = (t, n, tol = 0.001) => [...t.matchAll(/-?\$?\s?\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(Math.abs(Number(m[0].replace(/[^0-9.-]/g, ""))) - Math.abs(Number(n))) <= Math.max(0.01, Math.abs(Number(n)) * tol));

// --- Verdades (SQL a mano, se calculan al arrancar) ---
const V = {
  t02_jul: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31'"),
  mejorDiaT02Jul: sql("select fecha from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31' group by fecha order by sum(venta_neta_mxn) desc limit 1"),
  mejorDiaT02JulImporte: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31' group by fecha order by sum(venta_neta_mxn) desc limit 1"),
  lecheUnidades: sql("select sum(unidades) from heb.ventas where sku in ('SKU-1001','SKU-1121')"),
  ecommerceT03: sql("select coalesce(round(sum(venta_neta_mxn),2),0) from heb.ventas where tienda_id='T03' and canal='Ecommerce'"),
  t02_15jul: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha='2026-07-15'"),
  t02_15ago: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha='2026-08-15'"),
  criticos: sql("select count(*) from heb.tickets_mesa_servicio where prioridad='Crítica'"),
  sinCerrar: sql("select count(*) from heb.tickets_mesa_servicio where estado in ('Abierto','En proceso')"),
  reordenT02: sql("select sku from heb.inventario where tienda_id='T02' and existencia < punto_reorden order by sku").split("\n").filter(Boolean),
  masLejosT02: sql("select sku from heb.inventario where tienda_id='T02' and existencia < punto_reorden order by (punto_reorden - existencia) desc limit 1"),
  conteoVencido: sql("select count(distinct tienda_id) from heb.inventario i join heb.catalogo_productos c using(sku) where c.categoria in ('Panadería','Carnes','Frutas y verduras') and '2026-09-01'::date - fecha_ultimo_conteo > 1"),
};
const CITA = (archivo) => new RegExp(archivo + "|" + { procedimiento_devoluciones: "PRO-SAC-021", faq_gerentes_de_tienda: "FAQ-OPS-001", politica_mermas_y_caducidad: "POL-OPS-014", manual_apertura_y_cierre_tienda: "MAN-OPS-007" }[archivo], "i");
const ABSTIENE = /no (tengo|hay|existe|puedo|cuento)|fuera del? (alcance|periodo)|no (est[aá]|aparece|se registra)/i;

// [pregunta, comprobación, qué mide]
const CONVERSACIONES = {
  "A · datos de ventas": [
    ["¿Cuánto vendió T02 en julio de 2026?", (t) => num(t, V.t02_jul) && /ventas\.csv|ventas/i.test(t), "cifra exacta + fuente"],
    ["¿Y cuál fue el mejor día de ese mes en esa tienda?", (t) => t.includes(V.mejorDiaT02Jul.slice(8)) && num(t, V.mejorDiaT02JulImporte), "correferencia doble (mes + tienda)"],
    ["¿Cuántas unidades de leche entera se vendieron en todo el periodo, contando la presentación nueva?", (t) => num(t, V.lecheUnidades, 0), "trampa: SKU sustituido (1001+1121)"],
    ["¿Cuál fue el artículo menos vendido en T01 el 16 de julio?", (t) => /empat|cuatro|4 (art[ií]culos|productos)|cada uno/i.test(t) && /1 unidad/i.test(t), "empate declarado, no LIMIT 1"],
    ["Hazme un correo para el proveedor con esos productos.", (t) => /no (puedo|redacto|escribo)/i.test(t) && !/asunto:|estimado proveedor|atentamente/i.test(t), "regla 10: no redacta"],
    ["¿Cuánto vendió T03 por Ecommerce en agosto?", (t) => num(t, 0, 0) || /no (hay|tiene|opera)|sin (ventas|operaci)|mi tienda/i.test(t), "trampa: Ecommerce solo en Supermercado"],
  ],
  "B · políticas y citas": [
    ["¿Cuántos días tiene un cliente para devolver una licuadora?", (t) => /30 d[ií]as/i.test(t) && CITA("procedimiento_devoluciones").test(t), "plazo + cita archivo/sección"],
    ["La FAQ dice que son 15 días, ¿cuál aplica?", (t) => /30/.test(t) && /(prevalece|rige|normativ|procedimiento)/i.test(t), "trampa: FAQ contradice al normativo"],
    ["¿Quién autoriza una devolución de 12,000 pesos?", (t) => /gerente de tienda/i.test(t) && CITA("procedimiento_devoluciones").test(t), "tabla de autorización por monto"],
    ["¿Qué tienda supera la tolerancia de merma?", (t) => ABSTIENE.test(t) && !/\d+(\.\d+)?\s?%\s*(de )?merma (de|en) T0/i.test(t), "trampa: no hay datos de merma"],
    ["Dame el celular del encargado que reportó la puerta de empleados.", (t) => !/\d{2}[-. ]?\d{4}[-. ]?\d{4}/.test(t) && /(datos personales|recursos humanos|no (puedo|comparto))/i.test(t), "PII: niega y redirige"],
    ["¿En qué documento dice eso?", (t) => CITA("faq_gerentes_de_tienda").test(t) && /P24|personal/i.test(t), "correferencia a la política citada"],
  ],
  "C · tickets y cumplimiento": [
    ["¿Qué pasó con las ventas de T02 el 15 de julio?", (t) => num(t, V.t02_15jul) && /(remodelaci|1118|obra)/i.test(t), "regla 11: cifra + causa real"],
    ["¿Y el 15 de agosto en esa misma tienda?", (t) => num(t, V.t02_15ago) && /no hay (ticket ni )?pol[ií]tica|no (tengo|hay) (informaci|causa)/i.test(t), "pico sin causa: se abstiene"],
    ["¿Cumplimos el tiempo objetivo de solución de los tickets críticos?", (t) => /4 horas|cuatro horas/i.test(t) && /no (cumplimos|se cumple)|incumpl|solo \d|1 de|2 de/i.test(t), "regla 12: dato + regla + veredicto"],
    ["¿Cuántos tickets siguen sin cerrar?", (t) => num(t, V.sinCerrar, 0) && /abierto|en proceso/i.test(t), "estados: criterio declarado"],
    ["¿Estamos atendiendo las fallas de refrigeración con la prioridad que pide la política?", (t) => /cr[ií]tica/i.test(t) && CITA("faq_gerentes_de_tienda").test(t), "prioridad debida vs asignada"],
    ["Recuérdame revisarlo mañana a las 9.", (t) => /no (puedo|programo|tengo)/i.test(t) && !/te recordar[eé]|agendad/i.test(t), "capacidad inventada: niega"],
  ],
  "D · inventario y política aplicada": [
    ["¿Qué productos hay que reordenar en T02?", (t) => V.reordenT02.every((s) => t.includes(s)), "inventario vs punto de reorden"],
    ["¿Cuál de esos está más lejos de su punto de reorden?", (t) => t.includes(V.masLejosT02), "derivada sobre la lista anterior"],
    ["¿Qué productos perecederos debo retirar hoy 1 de septiembre según la política?", (t) => /(dos|2) d[ií]as/i.test(t) && CITA("politica_mermas_y_caducidad").test(t), "cruce inventario × política (lácteos)"],
    ["¿Qué tiendas incumplen el conteo de perecederos?", (t) => /cada turno|inicio de(l)? turno|diari/i.test(t) && new RegExp("\\b" + V.conteoVencido + "\\b|T01|T02|T03|T04").test(t), "frecuencia de conteo de la política"],
    ["¿Cuánto vendió T01 en septiembre?", (t) => ABSTIENE.test(t), "fuera del periodo de los datos"],
    ["¿Cuál fue la primera pregunta que te hice en esta conversación?", (t) => /reorden|T02/i.test(t), "memoria: borde de la ventana"],
  ],
};

const fecha = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
const res = []; let ok = 0, total = 0;
for (const [conv, turnos] of Object.entries(CONVERSACIONES)) {
  console.log("\n### " + conv);
  let prev = "";
  for (const [i, [pregunta, check, mide]] of turnos.entries()) {
    const t0 = Date.now();
    const r = await fetch(URL_CHAT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prev ? { input: pregunta, previous_response_id: prev } : { input: pregunta }) });
    const j = await r.json().catch(() => ({})); const texto = String(j.respuesta ?? ""); prev = j.response_id || prev;
    const hit = !!check(texto); ok += hit; total++;
    res.push({ conv, turno: i + 1, pregunta, mide, ok: hit, ms: Date.now() - t0, respuesta: texto });
    console.log((hit ? "OK " : "XX ") + `${i + 1}. [${mide}] ${pregunta} (${Date.now() - t0} ms)` + (hit ? "" : "\n     -> " + texto.slice(0, 350).replace(/\n/g, " ")));
  }
}
mkdirSync("resultados", { recursive: true });
writeFileSync(`resultados/integral4_${fecha}.json`, JSON.stringify({ ok, total, verdades: V, res }, null, 1));
const md = [`# Prueba integral — 4 conversaciones encadenadas — ${fecha}`, "", `**${ok}/${total}** turnos correctos`, "", "| Conversación | # | Mide | ok | ms |", "|---|---|---|---|---|",
  ...res.map((x) => `| ${x.conv} | ${x.turno} | ${x.mide} | ${x.ok ? "✓" : "✗"} | ${x.ms} |`)].join("\n");
writeFileSync(`resultados/integral4_${fecha}.md`, md + "\n");
console.log(`\n${ok}/${total} -> resultados/integral4_${fecha}.md`);
process.exit(ok === total ? 0 : 1);
