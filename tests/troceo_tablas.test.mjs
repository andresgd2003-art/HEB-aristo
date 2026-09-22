// Simula el nodo con los 4 documentos y compara fragmentos con filas de tabla rotas.
import { readFileSync, readdirSync } from "node:fs";
const codigo = readFileSync("infra/trocear_contexto.js", "utf8");
function correr(js, documento, contenido) {
  const $ = () => ({ first: () => ({ json: { body: { documento, contenido } } }) });
  return new Function("$", js)($);
}
const viejo = codigo.replace(/\/\/ Una tabla Markdown nunca[\s\S]*?continue;\n    }\n/, "");
for (const f of readdirSync("corpus/politicas").filter((x) => x.endsWith(".md"))) {
  const c = readFileSync("corpus/politicas/" + f, "utf8");
  for (const [tag, js] of [["viejo", viejo], ["nuevo", codigo]]) {
    const items = correr(js, f, c);
    const rotos = items.filter((i) => /^\|(?!.*\|\s*$)/m.test(i.json.texto) || /\|\n\n\|/.test(i.json.texto) || (/^\| /m.test(i.json.texto) && !/^\|\s*-{3,}/m.test(i.json.texto))).length;
    const largos = items.map((i) => i.json.texto.length);
    console.log(`${f} ${tag}: ${items.length} fragmentos, con tabla rota o sin cabecera: ${rotos}, max ${Math.max(...largos)}`);
  }
}
