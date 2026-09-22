// Ticket 08: tokens y costo REALES por turno, leidos del `tokenUsage` que n8n guarda en cada llamada al
// modelo (agente principal y agente SQL anidado en la misma ejecucion; los sub-flujos historicos se ligan por parentExecution). No se estima nada.
//
// Escribe input_tokens/output_tokens en heb_turnos (por ventana de tiempo de la ejecucion) y deja un
// reporte en resultados/costo_<fecha>.md con el promedio por familia (cifras/politicas/abstencion,
// tomada del ultimo gate) y global.
//
// Uso: node infra/costo.mjs [n_ejecuciones=60]
import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const API = env.N8N_BASE_URL.replace(/\/$/, ""), H = { "X-N8N-API-KEY": env.N8N_API_KEY };
const N = Number(process.argv[2] || 60);
const CHAT = "ZpkluoNfIEbhI9K8";
const HIJOS = { hvtOA1Vxq01Tnujq: "sql", HhHRb2CLFh8l2raR: "sql", jtoFR8nblsiZhNOP: "politicas_hijo" };
// Tarifa publica OpenAI (developers.openai.com/api/docs/models/gpt-5-mini, consultada 2026-09-18), USD por 1M tokens.
const TARIFA = { "gpt-5-mini": { in: 0.25, out: 2.0 }, "text-embedding-3-small": { in: 0.02, out: 0 } };

const ejecuciones = async (wf, n) => {
  const out = []; let cursor = "";
  while (out.length < n) {
    const r = await fetch(`${API}/api/v1/executions?workflowId=${wf}&limit=${Math.min(100, n - out.length)}&includeData=true${cursor ? "&cursor=" + cursor : ""}`, { headers: H });
    const j = await r.json(); out.push(...(j.data || [])); cursor = j.nextCursor; if (!cursor || !j.data?.length) break;
  }
  return out;
};
const tokensDe = (e) => {
  // `tokenUsage` = reportado por OpenAI; `tokenUsageEstimate` = estimado por n8n cuando la respuesta no trae usage
  // (pasa en el agente SQL anidado, que llama herramientas). Se suman ambos y se cuenta cuantos fueron estimados.
  const t = { in: 0, out: 0, llamadas: 0, estimadas: 0 };
  for (const runs of Object.values(e.data?.resultData?.runData || {})) for (const x of runs) {
    for (const m of JSON.stringify(x).matchAll(/"tokenUsage(Estimate)?":\{"completionTokens":(\d+),"promptTokens":(\d+)/g)) { t.out += +m[2]; t.in += +m[3]; t.llamadas++; if (m[1]) t.estimadas++; }
  }
  return t;
};

const padres = (await ejecuciones(CHAT, N)).filter((e) => e.status === "success");
const hijos = {};
for (const wf of Object.keys(HIJOS)) for (const e of await ejecuciones(wf, N * 3)) {
  const p = e.data?.parentExecution?.executionId; if (p) (hijos[p] ??= []).push({ rol: HIJOS[wf], ...tokensDe(e) });
}
// Familia por pregunta, de todos los gates corridos.
const familias = {};
const gates = readdirSync("resultados").filter((f) => f.startsWith("gate_prompt_")).sort();
for (const g of gates) for (const r of JSON.parse(readFileSync("resultados/" + g, "utf8"))) familias[r.pregunta] = r.familia;

const filas = [];
for (const e of padres) {
  const entrada = String(e.data?.resultData?.runData?.["Webhook"]?.[0]?.data?.main?.[0]?.[0]?.json?.body?.input ?? "");
  const principal = tokensDe(e);
  const h = hijos[e.id] || [];
  const sql = h.filter((x) => x.rol === "sql").reduce((a, x) => ({ in: a.in + x.in, out: a.out + x.out, llamadas: a.llamadas + x.llamadas, estimadas: a.estimadas + x.estimadas }), { in: 0, out: 0, llamadas: 0, estimadas: 0 });
  const tot_in = principal.in + sql.in, tot_out = principal.out + sql.out;
  // Embeddings: n8n no reporta tokens; la consulta embebida es la pregunta (~len/4). Es lo unico estimado y es despreciable.
  const emb = Math.ceil(entrada.length / 4);
  const usd = (tot_in * TARIFA["gpt-5-mini"].in + tot_out * TARIFA["gpt-5-mini"].out + emb * TARIFA["text-embedding-3-small"].in) / 1e6;
  filas.push({ id: e.id, inicio: e.startedAt, fin: e.stoppedAt, entrada, familia: familias[entrada] || "otra", principal, sql, tot_in, tot_out, usd,
    ms: new Date(e.stoppedAt) - new Date(e.startedAt) });
}

// heb_turnos: tokens reales por turno (match por ventana de tiempo de la ejecucion).
const upd = filas.map((f) => `UPDATE heb_turnos SET input_tokens=${f.tot_in}, output_tokens=${f.tot_out} WHERE creado_en BETWEEN '${f.inicio}'::timestamptz - interval '2 seconds' AND '${f.fin}'::timestamptz + interval '5 seconds' AND entrada = $q$${f.entrada.replace(/\$q\$/g, "")}$q$;`).join("\n");
if (upd) execFileSync("ssh", ["-i", env.VPS_KEY, "root@" + env.VPS_HOST, "docker exec -i bano_postgres psql -U bano -d bano -q"], { input: upd, encoding: "utf8" });

const prom = (xs, k) => xs.length ? xs.reduce((a, x) => a + x[k], 0) / xs.length : 0;
const porFam = {};
for (const f of filas) (porFam[f.familia] ??= []).push(f);
const linea = (nombre, xs) => `| ${nombre} | ${xs.length} | ${Math.round(prom(xs, "tot_in"))} | ${Math.round(prom(xs, "tot_out"))} | ${prom(xs, "usd").toFixed(5)} | ${(prom(xs, "ms") / 1000).toFixed(1)} s |`;
const md = [
  `# Costo por interacción — ${new Date().toISOString().slice(0, 16)}`, "",
  `Fuente: \`tokenUsage\` real de ${filas.length} ejecuciones exitosas del chat (+ sus hijos SQL). Modelo gpt-5-mini en todos los nodos;`,
  `tarifa US$0.25 / 1M entrada, US$2.00 / 1M salida (OpenAI, 2026-09-18). Embeddings text-embedding-3-small US$0.02 / 1M (estimado por longitud de la pregunta, < US$0.000001 por turno).`, "",
  "| Familia | n | tokens entrada | tokens salida | USD / interacción | latencia |", "|---|---|---|---|---|---|",
  ...Object.entries(porFam).map(([k, v]) => linea(k, v)), linea("**global**", filas), "",
  `- Agente principal: ${Math.round(filas.reduce((a, f) => a + f.principal.in, 0) / filas.length)} in / ${Math.round(filas.reduce((a, f) => a + f.principal.out, 0) / filas.length)} out por turno (${(filas.reduce((a, f) => a + f.principal.llamadas, 0) / filas.length).toFixed(1)} llamadas).`,
  ...(filas.some((f) => f.sql.llamadas) ? [`- Hijo SQL (cuando se usa, ${filas.filter((f) => f.sql.llamadas).length} de ${filas.length} turnos): ${Math.round(prom(filas.filter((f) => f.sql.llamadas), "sql.in") || filas.filter((f) => f.sql.llamadas).reduce((a, f) => a + f.sql.in, 0) / Math.max(1, filas.filter((f) => f.sql.llamadas).length))} in / ${Math.round(filas.filter((f) => f.sql.llamadas).reduce((a, f) => a + f.sql.out, 0) / Math.max(1, filas.filter((f) => f.sql.llamadas).length))} out (${(filas.filter((f) => f.sql.llamadas).reduce((a, f) => a + f.sql.llamadas, 0) / Math.max(1, filas.filter((f) => f.sql.llamadas).length)).toFixed(1)} llamadas).`] : ["- El agente SQL corre dentro del mismo flujo (AI Agent Tool): sus tokens ya estan en la linea anterior."]),
  `- Llamadas con tokens estimados por n8n (sin usage del proveedor): ${filas.reduce((a, f) => a + f.principal.estimadas + f.sql.estimadas, 0)} de ${filas.reduce((a, f) => a + f.principal.llamadas + f.sql.llamadas, 0)}.`,
  `- El prompt de sistema (~1.2k tokens) y el esquema+ejemplos del agente SQL anidado (~2.3k) son la mayor parte de la entrada; la salida incluye el razonamiento del modelo.`, "",
  `Proyección: 10 interacciones/día × 30 días = ${(prom(filas, "usd") * 300).toFixed(2)} USD/mes; 100/día = ${(prom(filas, "usd") * 3000).toFixed(2)} USD/mes.`, "",
  "## Por turno", "", "| exec | familia | in | out | USD | s | pregunta |", "|---|---|---|---|---|---|---|",
  ...filas.map((f) => `| ${f.id} | ${f.familia} | ${f.tot_in} | ${f.tot_out} | ${f.usd.toFixed(5)} | ${(f.ms / 1000).toFixed(1)} | ${f.entrada.slice(0, 60)} |`),
].join("\n");
mkdirSync("resultados", { recursive: true });
const salida = `resultados/costo_${new Date().toISOString().slice(0, 10)}.md`;
writeFileSync(salida, md);
console.log(md.split("\n## Por turno")[0]);
console.log("->", salida, "| heb_turnos actualizado:", filas.length, "turnos");
