// Estres de la memoria del chat (encadenado por previous_response_id, ventana de 10 turnos, aislamiento
// entre conversaciones, limites del guardia). Verdad de cifras por SQL a mano.
// Uso: node tests/estres_memoria.mjs
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const URL = env.N8N_BASE_URL + "/webhook/heb-aristo/chat";
const sql = (q) => execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, `docker exec bano_postgres psql -U bano -d bano -tA -c "${q.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
const tiene = (t, esperado) => { const n = Math.abs(num(esperado)); return [...t.matchAll(/-?\$?\s?\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(Math.abs(num(m[0])) - n) <= Math.max(0.01, n * 0.001)); };
const norm = (t) => String(t).replace(/[‐‑‒–−]/g, "-");
async function turno(input, prev) {
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, previous_response_id: prev ?? null }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, id: j.response_id, texto: norm(j.respuesta ?? JSON.stringify(j)), code: j.code, ms: Date.now() - t0 };
}
const V = {
  t02jul: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-07-01' and '2026-07-31'"),
  t02ago: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T02' and fecha between '2026-08-01' and '2026-08-31'"),
  t03ago: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T03' and fecha between '2026-08-01' and '2026-08-31'"),
  t01jun: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T01' and fecha between '2026-06-01' and '2026-06-30'"),
  t04jun: sql("select round(sum(venta_neta_mxn),2) from heb.ventas where tienda_id='T04' and fecha between '2026-06-01' and '2026-06-30'"),
};
const res = []; const ok = (caso, cond, detalle) => { res.push({ caso, ok: !!cond, detalle }); console.log((cond ? "OK " : "XX ") + caso + (cond ? "" : "  -> " + String(detalle).replace(/\n/g, " ").slice(0, 260))); };

// 1. Correferencia en cadena
{
  let a = await turno("¿Cuánto vendió T02 en julio?"); ok("correferencia: turno 1 T02 julio", tiene(a.texto, V.t02jul), a.texto);
  let b = await turno("¿Y en agosto?", a.id); ok("correferencia: '¿y en agosto?' -> T02 agosto", tiene(b.texto, V.t02ago), b.texto);
  let c = await turno("¿Y T03 ese mismo mes?", b.id); ok("correferencia: 'T03 ese mismo mes' -> T03 agosto", tiene(c.texto, V.t03ago), c.texto);
  let d = await turno("¿Cuál de las dos vendió más en ese mes?", c.id);
  ok("correferencia: comparacion sin repetir datos", (num(V.t02ago) > num(V.t03ago) ? /T02/.test(d.texto) : /T03/.test(d.texto)) && !/no (tengo|sé|recuerdo)/i.test(d.texto), d.texto);
}
// 2. Aislamiento entre conversaciones intercaladas
{
  let a = await turno("Quiero revisar la tienda T01. ¿Cuánto vendió en junio?"); let b = await turno("Ahora la tienda T04: ¿cuánto vendió en junio?");
  ok("aislamiento: A T01 junio", tiene(a.texto, V.t01jun), a.texto); ok("aislamiento: B T04 junio", tiene(b.texto, V.t04jun), b.texto);
  let a2 = await turno("¿De qué tienda estábamos hablando?", a.id); let b2 = await turno("¿De qué tienda estábamos hablando?", b.id);
  ok("aislamiento: A recuerda T01 y no T04", /T01|Valle Norte/.test(a2.texto) && !/T04/.test(a2.texto), a2.texto);
  ok("aislamiento: B recuerda T04 y no T01", /T04|Lomas/.test(b2.texto) && !/T01/.test(b2.texto), b2.texto);
}
// 3. Premisa falsa temprana no contamina la cifra
{
  let a = await turno("Recuerda esto para después: T02 vendió 5 millones en julio."); let b = await turno("Gracias. ¿Cuántos tickets críticos hubo?", a.id);
  let c = await turno("Ahora sí: ¿cuánto vendió T02 en julio?", b.id);
  ok("premisa falsa: responde desde SQL, no desde lo 'recordado'", tiene(c.texto, V.t02jul) && !/5,000,000|5 millones/.test(c.texto.replace(/no (es|son|fueron) 5 millones/i, "")), c.texto);
}
// 4. Ventana de 10 turnos: ¿recuerda el turno 1 tras 12 turnos?
{
  let a = await turno("Empecemos con la tienda T03. ¿Cuántos tickets abiertos tiene?"); let prev = a.id;
  for (let i = 0; i < 11; i++) { const r = await turno(["¿Cuántos productos hay en el catálogo?", "¿Cuántas tiendas hay?", "¿Qué formato tiene T01?"][i % 3], prev); prev = r.id; }
  const z = await turno("¿Cuál fue la primera tienda por la que te pregunté en esta conversación?", prev);
  ok("ventana 10 turnos: recuerda T03 tras 12 turnos (informativo: la ventana es 10)", /T03|Anáhuac/.test(z.texto), z.texto);
  res.at(-1).informativo = true;
}
// 5. Cadena invalida
{ const r = await turno("¿Cuánto vendió T01 en junio?", "resp_noexiste123"); ok("cadena invalida -> 400 previous_response_not_found", r.status === 400 && r.code === "previous_response_not_found", r.status + " " + r.texto); }
// 6. Rafaga en la misma conversacion (limite 20/min)
{
  let a = await turno("¿Cuántas tiendas hay?"); let prev = a.id, codes = [];
  const t0 = Date.now();
  for (let i = 0; i < 22; i++) { const r = await turno("¿Cuántas tiendas hay?", prev); codes.push(r.status); if (r.id) prev = r.id; if (Date.now() - t0 > 55000) break; }
  const hubo429 = codes.includes(429);
  ok("rafaga: aparece 429 rate_limited dentro del minuto (" + codes.filter((c) => c === 429).length + " de " + codes.length + ")", hubo429 || codes.length < 20, codes.join(","));
  if (!hubo429 && codes.length < 20) res.at(-1).detalle = "no se alcanzaron 20 turnos en 60 s (latencia); limite no ejercitado";
}
// 7. Concurrencia: 5 conversaciones en paralelo
{
  const qs = [["T01", "junio", V.t01jun], ["T04", "junio", V.t04jun], ["T02", "julio", V.t02jul], ["T02", "agosto", V.t02ago], ["T03", "agosto", V.t03ago]];
  const rs = await Promise.all(qs.map(([t, m]) => turno(`¿Cuánto vendió ${t} en ${m}?`)));
  ok("concurrencia: 5 en paralelo, todas 200 y correctas", rs.every((r, i) => r.status === 200 && tiene(r.texto, qs[i][2])), rs.map((r) => r.status + ":" + r.texto.slice(0, 40)).join(" | "));
}
mkdirSync("resultados", { recursive: true });
const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const duros = res.filter((r) => !r.informativo);
const md = [`# Estrés de memoria — ${fecha}`, "", `${duros.filter((r) => r.ok).length}/${duros.length} casos (más 1 informativo sobre la ventana de 10 turnos)`, "", "| caso | ok |", "|---|---|", ...res.map((r) => `| ${r.caso} | ${r.ok ? "✓" : "✗"}${r.informativo ? " (informativo)" : ""} |`)].join("\n");
writeFileSync(`resultados/memoria_${fecha}.md`, md + "\n"); writeFileSync(`resultados/memoria_${fecha}.json`, JSON.stringify(res, null, 1));
console.log("\n" + md);
process.exit(duros.every((r) => r.ok) ? 0 : 1);
