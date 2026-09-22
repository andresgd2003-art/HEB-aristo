// Convierte la respuesta (Markdown del modelo) al HTML que Telegram acepta. Corre en el nodo "Redactar respuesta"
// y en local (infra/telegram_formato.test.mjs). Telegram HTML: b i u s code pre a blockquote; sin listas ni encabezados.
// Emojis por tema (opcion `emojis`, por canal). Uno por linea, al inicio, nunca dentro de cifras ni citas.
// Diccionario propio en espanol (no emojilib: es en ingles, ~1,900 emojis y tapizaria la respuesta). El orden
// importa: gana la primera regla que casa. Ampliar aqui, con el vocabulario del dominio, no con una biblioteca.
const EMOJIS = [
  [/\b(no tengo|no hay (datos|información|registro)|no puedo|no es posible|fuera de mi alcance|no está en)/i, '⚠️'],
  [/\b(cr[ií]tic[ao]s?|urgente|riesgo|fraude|alerta)/i, '🚨'],
  [/\b(devoluci[oó]n(es)?|reembols|cambio de producto|vale de tienda)/i, '↩️'],
  [/\b(vent[ae]s?|vendi[oó]|venta neta|importe|ingres|margen|ecommerce)/i, '💰'],
  [/\b(caduc|vence|fecha de caducidad|lote|pr[oó]ximo a vencer|rebaja)/i, '🗓️'],
  [/\b(inventario|existencia|reorden|reabast|stock|sku|cat[aá]logo)/i, '📦'],
  [/\b(tickets?|folio|mesa de servicio|incidencia)/i, '🎫'],
  [/\b(refrigera|c[aá]mara|congela|cadena de fr[ií]o|temperatura|sin fr[ií]o|luz)/i, '❄️'],
  [/\b(caja(s)?|arqueo|efectivo|fondo fijo|corte de caja|terminal bancaria)/i, '💳'],
  [/\b(mantenimiento|obra|remodelaci[oó]n|montacargas|cortina|gotera|anaquel flojo)/i, '🔧'],
  [/\b(sistema|servidor|enlace|internet|handheld|impresora|sigma|wifi)/i, '💻'],
  [/\b(colaborador|personal|empleado|recursos humanos|n[oó]mina|vacaciones|uniformes|turno)/i, '👥'],
  [/\b(proveedor|recepci[oó]n de mercanc[ií]a|and[eé]n|cedis|pedido)/i, '🚚'],
  [/\b(l[aá]cteos|leche|yogur|queso)/i, '🥛'],
  [/\b(panader[ií]a|pan\b|bolillo|tortilla)/i, '🥖'],
  [/\b(carnes?|pollo|res\b|pescado|nuggets)/i, '🥩'],
  [/\b(frutas?|verduras?|pl[aá]tano|lim[oó]n|jitomate|cebolla|aguacate)/i, '🍎'],
  [/\b(bebidas?|refresco|jugo|agua embotellada|cerveza)/i, '🥤'],
  [/\b(limpieza|cuidado personal|jab[oó]n|papel higi[eé]nico)/i, '🧴'],
  [/\b(pol[ií]tica|procedimiento|manual|faq|secci[oó]n|regla|plazo|autoriza|\.pdf)/i, '📄'],
  [/\b(tienda|sucursal|t0[1-4]\b|supermercado|mi tienda)/i, '🏬'],
  [/\b(apertura|cierre|horario|bit[aá]cora|checklist)/i, '🕖'],
];
const emojiPara = (linea) => { const limpia = linea.replace(/<[^>]+>/g, ''); for (const [re, e] of EMOJIS) if (re.test(limpia)) return e; return ''; };

function telegramHtml(md, opciones = { emojis: true }) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let t = esc(String(md ?? '').replace(/\r/g, '').replace(/[‐‑‒–−]/g, '-'));
  const lineas = t.split('\n').map((l) => l.replace(/\s+$/, ''));
  const out = [];
  for (let l of lineas) {
    if (/^\s*\|[\s-:|]+\|\s*$/.test(l)) continue;                       // separador de tabla
    if (/^\s*\|.*\|\s*$/.test(l)) l = l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()).join(' — ');
    l = l.replace(/^\s*#{1,6}\s+(.*)$/, '<b>$1</b>');                     // encabezados -> negrita
    l = l.replace(/^\s*[-*]\s+/, '• ').replace(/^\s{2,}[-*]\s+/, '   ◦ '); // viñetas
    l = l.replace(/^\s*(\d+)[.)]\s+/, '$1. ');
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>');
    l = l.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>');
    l = l.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    l = l.replace(/\b((?:FAQ|MAN|POL|PRO)-[A-Z]{3}-\d{3})(\s*(?:§|P)\s*[\d.]+[^)\n;,]*)?/g, '<i>$1$2</i>');
    out.push(l);
  }
  // Bloques de viñetas compactos (sin lineas en blanco entre •) y una linea en blanco antes del bloque.
  const ls = out.join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n'), fin = [];
  const esV = (x) => /^(• |   ◦ |\d+\. )/.test(x);
  for (let i = 0; i < ls.length; i++) {
    const prev = fin[fin.length - 1];
    if (esV(ls[i]) && prev !== undefined && prev !== '' && !esV(prev)) fin.push('');
    if (ls[i] === '' && esV(prev ?? '') && esV(ls[i + 1] ?? '')) continue;
    fin.push(ls[i]);
  }
  t = fin.join('\n');
  // Enfasis visual (solo en texto que aun no tiene etiquetas): archivo en <code>, seccion citada subrayada,
  // importes y cantidades con unidad en negrita, etiqueta de la viñeta en negrita, "segun ..." en cursiva.
  t = t.split(/(<[a-z]+>[^<]*<\/[a-z]+>)/).map((seg, i) => i % 2 ? seg : seg
    .replace(/\b([a-z_]+\.(?:pdf|csv))\b/g, '<code>$1</code>')
    .replace(/(secci[oó]n\s+\d+(?:\.\d+)?\s*«[^»\n]+»|secci[oó]n\s+\d+(?:\.\d+)?|§\s*[\d.]+|\bP\d{1,2}(?=[^\w\d]|$))/g, '<u>$1</u>')
    .replace(/(\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|M|mil|millones|MXN))?)/g, '<b>$1</b>')
    .replace(/(?<![\w$>])(\d[\d,]*(?:\.\d+)?\s?(?:%|unidades|piezas|tickets|productos|SKUs?|d[ií]as(?: naturales| h[aá]biles)?|horas?|minutos|meses|semanas|kg|filas|artículos))\b/g, '<b>$1</b>')
    .replace(/(^|\n)(• |\d+\. )([^:\n<]{3,60}):/g, '$1$2<b>$3:</b>')
    .replace(/\b(seg[uú]n (?:el |la |los |las )?[^.;\n<]{3,80}?)(?=[.;\n)])/g, '<i>$1</i>')
  ).join('');
  // Fuente plegable: las lineas que solo citan ("Según ...", "Fuente: ...", "Citas: ...") van en un blockquote expandible,
  // asi la respuesta se lee corta y la cita sigue a un toque. Solo lineas completas de cita; nunca las que llevan cifras.
  t = t.split('\n').map((l) => (/^(Según|Fuente|Citas?|Cita relevante|Regla)\b/i.test(l.replace(/<[^>]+>/g, '')) && !/\$\s?\d/.test(l) && l.length > 40) ? '<blockquote expandable>' + l + '</blockquote>' : l).join('\n');
  // Primera linea en negrita si no lo esta ya y es corta (el dato/regla de un vistazo)
  const primera = t.split('\n')[0];
  if (primera && !/<b>|^• |^\d+\. /.test(primera) && primera.length <= 160) t = '<b>' + primera + '</b>' + t.slice(primera.length);
  if (opciones.emojis) {
    // Un emoji por linea "de bloque": la primera linea y las etiquetas de viñeta / encabezados en negrita.
    // Nunca dos iguales seguidos, para no tapizar la respuesta.
    let ultimo = '';
    t = t.split('\n').map((l, i) => {
      const esBloque = i === 0 || /^<b>[^<]{3,80}<\/b>$/.test(l) || /^• <b>[^<]{3,60}:<\/b>/.test(l);
      if (!esBloque || !l.trim()) return l;
      const e = emojiPara(l);
      if (!e || e === ultimo) return l;
      ultimo = e;
      return l.startsWith('• ') ? '• ' + e + ' ' + l.slice(2) : e + ' ' + l;
    }).join('\n');
  }
  if (t.length > 4000) t = t.slice(0, 3990).replace(/<[^>]*$/, '') + '…';
  return t;
}
if (typeof module !== 'undefined') module.exports = { telegramHtml, EMOJIS };
