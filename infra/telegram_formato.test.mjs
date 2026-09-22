import { createRequire } from "node:module"; import assert from "node:assert/strict";
const { telegramHtml } = createRequire(import.meta.url)("./telegram_formato.js");
const r = telegramHtml("$1,810,013.00 según ventas de julio.\n\n### Detalle\n- Piso: **$1.7M**\n- Ecommerce: $100k\n| a | b |\n|---|---|\n| x | y |\nSegún PRO-SAC-021 §3 Plazos, 30 días. Ver `heb.ventas` y 5 < 7 & más.");
assert.match(r, /^💰 <b>\$1,810,013\.00<\/b> <i>según ventas de julio<\/i>\./);   // emoji de tema, cifra en negrita, origen en cursiva
assert.match(r, /<b>Detalle<\/b>\n\n• <b>Piso:<\/b> <b>\$1\.7M<\/b>\n• <b>Ecommerce:<\/b> <b>\$100k<\/b>/); // etiqueta y montos
assert.match(r, /x — y/); assert.doesNotMatch(r, /\|---/);                      // tablas -> lineas
assert.match(r, /<i>PRO-SAC-021 §3 Plazos<\/i>/); assert.match(r, /<b>30 días<\/b>/); assert.match(r, /<code>heb\.ventas<\/code>/);
assert.match(r, /5 &lt; 7 &amp; más/);                                           // escape HTML
const c = telegramHtml("30 días naturales. Procedimiento de devoluciones (procedimiento_devoluciones.pdf), sección 3 «Plazos de devolución».");
assert.match(c, /<code>procedimiento_devoluciones\.pdf<\/code>/); assert.match(c, /<u>sección 3 «Plazos de devolución»<\/u>/);
assert.ok(telegramHtml("x".repeat(5000)).length <= 4000);
console.log("telegram_formato: ok\n\n" + r + "\n\n" + c);
