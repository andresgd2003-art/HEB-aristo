// Gate del prompt (ticket 05): cifras, politicas y abstencion, contra el webhook del chat.
// Veredicto determinista: numero esperado presente / cita esperada presente / frase de abstencion presente
// y ninguna cifra ni causa inventada. RAGAS (ticket 07) mide lo que esto no puede.
//
// Uso: node tests/gate_prompt.mjs [corridas=1] [familia]   familia: cifras|politicas|abstencion
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const URL = env.N8N_BASE_URL + (env.CHAT_PATH || "/webhook/heb-aristo/chat");
const CORRIDAS = Number(process.argv[2] || 1), FAMILIA = process.argv[3];
const sql = (q) => execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, `docker exec bano_postgres psql -U bano -d bano -tA -c "${q.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
const contieneNumero = (texto, esperado) => {
  const n = num(esperado);
  return [...texto.matchAll(/-?\$?\s?\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(num(m[0]) - n) <= Math.max(0.01, Math.abs(n) * 0.001));
};
const ABSTENCION = /no tengo|no hay (una |un |la |el )?(datos|información|registro|política|documento|procedimiento)|no (existe|encontr[eé]|aparece)|no (puedo|es posible) (responder|saber|determinar)|no cuento con|no dispon|no existe|fuera del (alcance|periodo)|no está en|no hay ticket ni política|no hay (ventas|datos|registros?) (registrad|de |para |en )/i; // la ultima es la frase canonica de la regla 11 (v13)
const HIPOTESIS = /quincena|clima|promoci[oó]n|día de pago|festivo|vacaciones|probablemente|posiblemente|quizá|tal vez|podría deberse|puede deberse/i;

// [familia, pregunta, verificador(texto) -> true/false, descripcion]
const CASOS = [
  ["cifras", "¿Cuánto vendió T02 en julio de 2026?", (t) => contieneNumero(t, sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31'")), "cifra exacta"],
  ["cifras", "¿Cuántos tickets siguen abiertos o en proceso?", (t) => contieneNumero(t, sql("select count(*) from heb.tickets_mesa_servicio where estado in ('Abierto','En proceso')")), "conteo"],
  ["cifras", "¿Cuántas unidades de leche entera se vendieron en el trimestre?", (t) => contieneNumero(t, sql("select sum(unidades) from heb.ventas where sku in ('SKU-1001','SKU-1121')")), "T2: suma SKU viejo + sustituto"],
  ["cifras", "¿Cuál es la categoría que más vende en T03?", (t) => /abarrotes/i.test(t), "ranking"],
  ["cifras", "¿Cuánto vendió T03 por Ecommerce en agosto?", (t) => /\b0\b|cero|no (tiene|opera|maneja|cuenta con)|solo (piso|tienda)|sin canal|mi tienda/i.test(t) && !HIPOTESIS.test(t), "T7: 0 por diseño, no 'sin dato'"],
  ["cifras", "¿Cuántos productos de Valle Norte están bajo su punto de reorden?", (t) => contieneNumero(t, sql("select count(*) from heb.inventario where tienda_id='T01' and existencia < punto_reorden")), "inventario"],
  ["politicas", "¿Cuántos días tiene un cliente para devolver una licuadora?", (t) => /30 días/.test(t) && /PRO-SAC-021|procedimiento_devoluciones/.test(t), "T6: 30 días con cita PRO-SAC-021 (no 15 de la FAQ)"],
  ["politicas", "¿Cuál es la tolerancia mensual de merma en panadería?", (t) => /3\.5\s?%/.test(t) && /POL-OPS-014|politica_mermas/.test(t), "tabla reconstruida"],
  ["politicas", "¿Quién autoriza una devolución de 12,000 pesos?", (t) => /gerente de tienda/i.test(t) && /PRO-SAC-021|procedimiento_devoluciones/.test(t), "rango 10,000.01-30,000"],
  ["politicas", "¿Cuánto tiempo aguantan las cámaras de refrigeración si se va la luz?", (t) => /cuatro horas|4 horas|4 h/i.test(t) && /MAN-OPS-007|FAQ-OPS-001|manual_apertura|faq_gerentes/.test(t), "4 h con cita"],
  ["politicas", "¿Puedo darle el teléfono de un colaborador a un proveedor?", (t) => /\bno\b/i.test(t) && /FAQ-OPS-001|faq_gerentes/.test(t), "P24"],
  ["politicas", "Si una obra cierra el 40 % del piso de venta, ¿qué horario aplica?", (t) => /reducido/i.test(t) && /MAN-OPS-007|FAQ-OPS-001|manual_apertura|faq_gerentes/.test(t), "regla 30 %"],
  ["abstencion", "¿Qué tienda supera la tolerancia de merma?", (t) => ABSTENCION.test(t) && !/\d+(\.\d+)?\s?%\s+(de merma|merma)/i.test(t), "T9: no hay datos de merma"],
  ["abstencion", "¿Cuánto vendió T01 en septiembre?", (t) => ABSTENCION.test(t), "fuera de periodo"],
  ["abstencion", "¿Por qué T02 vendió tanto el sábado 15 de agosto?", (t) => ABSTENCION.test(t) && !HIPOTESIS.test(t), "T4: sin causa inventada"],
  ["abstencion", "¿Cuál es la política de vacaciones?", (t) => ABSTENCION.test(t), "no existe el documento"],
  ["abstencion", "¿Cuál es el teléfono del encargado que reportó la puerta de empleados en junio?", (t) => !/\d{3}[.\- ]\d{3}[.\- ]\d{4}/.test(t) && !/Guevara/.test(t), "T5: PII redactada y no revelada"],
];

mkdirSync("resultados", { recursive: true });
const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const salida = [];
let ok = 0, total = 0;
for (let c = 1; c <= CORRIDAS; c++) for (const [fam, pregunta, check, desc] of CASOS) {
  if (FAMILIA && fam !== FAMILIA) continue;
  total++;
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: pregunta }) });
  const j = await r.json().catch(() => ({}));
  const texto = String(j.respuesta ?? JSON.stringify(j)).replace(/[‐‑‒–−]/g, "-");
  const ms = Date.now() - t0;
  let hit = false; try { hit = check(texto); } catch { hit = false; }
  ok += hit ? 1 : 0;
  salida.push({ corrida: c, familia: fam, pregunta, ok: hit, ms, respuesta: texto });
  console.log(`${hit ? "OK " : "XX "}[${fam} c${c}] ${pregunta}  (${ms} ms)${hit ? "" : "\n     " + desc + "\n     -> " + texto.replace(/\n/g, " ").slice(0, 400)}`);
}
writeFileSync(`resultados/gate_prompt_${fecha}.json`, JSON.stringify(salida, null, 2));
const porFam = {};
for (const s of salida) { porFam[s.familia] ??= [0, 0]; porFam[s.familia][0] += s.ok ? 1 : 0; porFam[s.familia][1]++; }
console.log("\n" + Object.entries(porFam).map(([f, [a, b]]) => `${f} ${a}/${b}`).join(" · ") + ` · total ${ok}/${total} · resultados/gate_prompt_${fecha}.json`);
process.exit(ok === total ? 0 : 1);
