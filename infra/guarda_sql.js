// Guarda determinista del SQL que genera el modelo. Corre como expresion dentro del Postgres Tool
// `ejecutar_sql` del flujo de chat (la inyecta infra/consolidar_sql.mjs) y tambien en local (guarda_sql.test.mjs).
// El usuario Postgres ya es de solo lectura (heb_lector): esto es la segunda capa, y la que
// da un mensaje claro en vez de un "permission denied".
//
// Contrato: guardar(textoDelModelo) -> { sql } o lanza Error con el motivo.

const TABLAS = ['tiendas', 'catalogo_productos', 'ventas', 'inventario', 'tickets_mesa_servicio'];
const LIMITE = 50;   // ponytail: 50 filas; mas no caben en la salida del agente SQL (JSON truncado = cifras falsas)

function guardar(crudo) {
  let sql = String(crudo ?? '').trim();
  // El modelo a veces envuelve en ```sql ... ``` o devuelve JSON {"sql": "..."}.
  const fence = sql.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) sql = fence[1].trim();
  if (sql.startsWith('{')) { try { sql = String(JSON.parse(sql).sql ?? '').trim(); } catch { /* sigue crudo */ } }
  sql = sql.replace(/;\s*$/, '').trim();

  if (!sql) throw new Error('El modelo no produjo SQL.');
  if (!/^(select|with)\b/i.test(sql)) throw new Error('Solo se permiten consultas SELECT.');
  if (/;/.test(sql)) throw new Error('Solo se permite una sentencia.');
  if (/--|\/\*|\*\//.test(sql)) throw new Error('No se permiten comentarios en el SQL.');
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|set|reset|vacuum|analyze|lock|listen|notify|refresh|into)\b/i.test(sql))
    throw new Error('Palabra clave no permitida en una consulta de solo lectura.');
  if (/\b(pg_catalog|pg_|information_schema|current_setting|pg_sleep|lo_|dblink|public\.)/i.test(sql))
    throw new Error('Acceso a objetos del sistema no permitido.');
  // Toda tabla referenciada debe ser del esquema heb (con o sin prefijo heb.) o un CTE propio.
  // (?:\bwith|,|\)) y no \b(?:with|,): \b no casa antes de una coma, asi que del segundo CTE en adelante no se reconocian
  // y la guardia los rechazaba como "tabla fuera del esquema" (8 reintentos, 156 s, sin respuesta).
  const ctes = [...sql.matchAll(/(?:\bwith|,|\))\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase());
  for (const m of sql.matchAll(/\b(?:from|join)\s+(?:heb\.)?([a-z_][a-z0-9_]*)/gi)) {
    const t = m[1].toLowerCase();
    if (!TABLAS.includes(t) && !ctes.includes(t) && !/^(select|lateral|unnest|generate_series)$/.test(t))
      throw new Error('Tabla fuera del esquema heb: ' + m[1]);
  }
  // LIMIT forzado: mas de 50 filas no caben en la salida del agente SQL (JSON truncado = cifras falsas).
  const lim = sql.match(/\blimit\s+(\d+)\s*$/i);
  if (!lim) sql += ' LIMIT ' + LIMITE;
  else if (Number(lim[1]) > LIMITE) sql = sql.replace(/\blimit\s+\d+\s*$/i, 'LIMIT ' + LIMITE);
  return { sql };
}

if (typeof module !== 'undefined') module.exports = { guardar, TABLAS, LIMITE };
