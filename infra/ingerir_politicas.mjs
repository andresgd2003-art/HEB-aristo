// Ingiere corpus/politicas/*.md en heb_aristo_corpus por el flujo "HEB-aristo — Ingesta del corpus".
// Reejecutar NO duplica: el flujo borra la version anterior por `documento` antes de insertar.
//
// Uso: node infra/ingerir_politicas.mjs            (lee HEB_INGESTA_URL y HEB_INGESTA_TOKEN de .env)
import { readFileSync, readdirSync, existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && m[2]) env[m[1]] ??= m[2];
}
const URL = env.HEB_INGESTA_URL, TOKEN = env.HEB_INGESTA_TOKEN;
if (!URL || !TOKEN) { console.error("Faltan HEB_INGESTA_URL / HEB_INGESTA_TOKEN"); process.exit(2); }

for (const f of readdirSync("corpus/politicas").filter((x) => x.endsWith(".md")).sort()) {
  const contenido = readFileSync("corpus/politicas/" + f, "utf8");
  // `documento` = archivo PDF + titulo + codigo: es la cabecera de cada fragmento y lo que el agente cita.
  // El evaluador conoce los documentos por su nombre de archivo (politicas/*.pdf), por eso va primero.
  const titulo = contenido.match(/^# (.+)$/m)[1];
  const codigo = contenido.match(/^Código: (\S+)/m)[1];
  const documento = `${f.replace(/\.md$/, ".pdf")} — ${titulo} (${codigo})`;
  const r = await fetch(URL + "/ingesta", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify({ documento, contenido }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { console.error(f, r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log(`${documento}: ${j.fragmentos} fragmentos, ${j.secciones} secciones, huerfanos=${j.huerfanos}, chars ${j.caracteres.min}-${j.caracteres.max} (media ${j.caracteres.media})`);
}
