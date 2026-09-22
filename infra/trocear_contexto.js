// Trocea el documento y devuelve UN ITEM POR FRAGMENTO, cada uno con su cabecera.
//
// Por que se trocea aqui y no en el nodo Troceador de n8n: el troceador no permite
// post-procesar cada trozo, asi que solo el PRIMERO conservaba el titulo de su
// seccion y los demas salian huerfanos. Medido en el corpus: 7 de 36 fragmentos
// bajaban de 300 caracteres y varios eran continuaciones sin cabecera; uno empezaba
// con "Fue su primer proyecto de IA..." y el antecedente estaba en otro fragmento.
//
// Un fragmento tiene que poder decir de que habla sin sus vecinos: la busqueda
// vectorial lo juzga aislado (ver ADR-0013).
//
// Se lee del Webhook y no de $input porque el nodo anterior (la limpieza en Postgres)
// corre con executeOnce y reemplaza los items por su propio resultado.

const TAMANO = 1000;   // caracteres de cuerpo por fragmento, sin contar la cabecera
const SOLAPE = 0;    // caracteres del fragmento anterior que se repiten al inicio

const body = $('Webhook Ingesta').first().json.body ?? {};
const documento = String(body.documento || '').trim();
const contenido = String(body.contenido || '');

if (!documento) throw new Error('Falta `documento`: el nombre con el que se identifica el corpus.');
if (contenido.trim().length === 0) throw new Error('Falta `contenido`: el texto del documento.');

// --- 1. Partir el markdown en piezas por encabezado (nivel 2 y nivel 3) ---
const piezas = [];
const porNivel2 = contenido.split(/^##\s+(?!#)/m);
const cabecera = porNivel2.shift();
if (cabecera && cabecera.trim().length > 0) {
  piezas.push({ seccion: 'Introduccion', subseccion: '', cuerpo: cabecera.trim() });
}
for (const bloque of porNivel2) {
  const salto = bloque.indexOf('\n');
  const seccion = (salto === -1 ? bloque : bloque.slice(0, salto)).trim();
  const resto = salto === -1 ? '' : bloque.slice(salto + 1);
  const porNivel3 = resto.split(/^###\s+/m);
  const intro = porNivel3.shift();
  if (intro && intro.trim().length > 0) {
    piezas.push({ seccion, subseccion: '', cuerpo: intro.trim() });
  }
  for (const sub of porNivel3) {
    const s2 = sub.indexOf('\n');
    const subseccion = (s2 === -1 ? sub : sub.slice(0, s2)).trim();
    const cuerpo = (s2 === -1 ? '' : sub.slice(s2 + 1)).trim();
    if (cuerpo.length > 0) piezas.push({ seccion, subseccion, cuerpo });
  }
}

if (piezas.length === 0) throw new Error('El documento no produjo ninguna seccion.');

// --- 2. Trocear cada pieza respetando limites naturales ---
// Se corta por parrafo; si un parrafo solo ya excede el tamano, por frase; y solo
// como ultimo recurso a lo bruto. Partir a mitad de frase produce fragmentos que
// no se entienden solos, que es justo lo que este ticket viene a arreglar.
function trocear(texto) {
  if (texto.length <= TAMANO) return [texto];

  const unidades = [];
  for (const parrafo of texto.split(/\n{2,}/)) {
    if (parrafo.length <= TAMANO) { unidades.push(parrafo); continue; }
    // Una tabla Markdown nunca se parte por frases (las celdas terminan en punto y las filas
    // quedarian rotas, con las ultimas huerfanas de cabecera). Se parte por FILAS y cada trozo
    // repite la cabecera (titulos + separador) para que se entienda solo.
    if (/^\|\s*-{3,}/m.test(parrafo)) {
      const lineas = parrafo.split('\n').filter((l) => l.trim().length > 0);
      const sep = lineas.findIndex((l) => /^\|\s*-{3,}/.test(l));
      // La cabecera es la fila anterior al separador; la prosa que venga antes (una tabla pegada
      // a su parrafo introductorio) va como unidad propia.
      const prosa = lineas.slice(0, sep - 1).join('\n');
      if (prosa.trim().length > 0) unidades.push(prosa);
      const filas = lineas.slice(sep - 1);
      const cab = filas.slice(0, 2).join('\n');
      let trozo = cab;
      for (const fila of filas.slice(2)) {
        if ((trozo + '\n' + fila).length > TAMANO && trozo !== cab) { unidades.push(trozo); trozo = cab; }
        trozo += '\n' + fila;
      }
      unidades.push(trozo);
      continue;
    }
    for (const frase of parrafo.split(/(?<=\.)\s+/)) {
      if (frase.length <= TAMANO) { unidades.push(frase); continue; }
      for (let i = 0; i < frase.length; i += TAMANO) unidades.push(frase.slice(i, i + TAMANO));
    }
  }

  const trozos = [];
  let actual = '';
  for (const u of unidades) {
    if (actual && (actual + '\n\n' + u).length > TAMANO) {
      trozos.push(actual);
      actual = SOLAPE > 0 ? actual.slice(-SOLAPE) + '\n\n' + u : u;
    } else {
      actual = actual ? actual + '\n\n' + u : u;
    }
  }
  if (actual.trim().length > 0) trozos.push(actual);
  return trozos;
}

// --- 3. Anteponer la cabecera a CADA fragmento ---
const items = [];
for (const p of piezas) {
  const titulo = [documento, p.seccion, p.subseccion].filter(Boolean).join(' — ');
  for (const trozo of trocear(p.cuerpo)) {
    items.push({
      json: {
        documento,
        seccion: p.seccion,
        subseccion: p.subseccion,
        texto: titulo + '\n\n' + trozo,
      },
    });
  }
}

return items;