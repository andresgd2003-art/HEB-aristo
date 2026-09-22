// node infra/guarda_sql.test.mjs — se rompe si la guarda deja pasar algo que no debe.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { guardar } = createRequire(import.meta.url)("./guarda_sql.js");

const pasa = (s) => guardar(s).sql;
const falla = (s, re) => assert.throws(() => guardar(s), re, "debio rechazar: " + s);

assert.equal(pasa("select sum(venta_neta_mxn) from ventas where tienda_id='T02'"), "select sum(venta_neta_mxn) from ventas where tienda_id='T02' LIMIT 50");
assert.equal(pasa("SELECT * FROM heb.inventario i JOIN catalogo_productos c ON c.sku=i.sku LIMIT 5"), "SELECT * FROM heb.inventario i JOIN catalogo_productos c ON c.sku=i.sku LIMIT 5");
assert.equal(pasa("select 1 from ventas limit 9999"), "select 1 from ventas LIMIT 50");
assert.equal(pasa("```sql\nselect count(*) from tickets_mesa_servicio;\n```"), "select count(*) from tickets_mesa_servicio LIMIT 50");
assert.equal(pasa('{"sql":"with t as (select 1 from tiendas) select * from t"}'), "with t as (select 1 from tiendas) select * from t LIMIT 50");

falla("delete from ventas", /SELECT/);
falla("select 1; drop table ventas", /una sentencia/);
falla("select 1 from ventas -- x", /comentarios/);
falla("select * from ventas where 1=1 union select * from public.bano_corpus", /sistema|esquema/);
falla("select * from turnos", /esquema heb/);
falla("select pg_sleep(10) from ventas", /sistema/);
falla("select * into t from ventas", /no permitida/);
falla("", /no produjo/);
console.log("guarda_sql: 13/13 ok");

// CTEs multiples: el segundo y siguientes tambien cuentan como tablas propias (antes solo el primero).
{ const r = guardar("WITH skus AS (SELECT DISTINCT sku FROM ventas), dias AS (SELECT generate_series('2026-07-01'::date, '2026-07-31'::date, interval '1 day')::date AS dia), diario AS (SELECT s.sku, d.dia FROM skus s CROSS JOIN dias d) SELECT * FROM diario"); assert.ok(/LIMIT 50$/.test(r.sql), "CTEs multiples aceptados"); }
assert.throws(() => guardar("WITH x AS (SELECT 1) SELECT * FROM x JOIN pg_tables t ON true"), /sistema|esquema/, "CTE no abre la puerta a tablas ajenas");
console.log("guarda_sql: CTEs multiples ok");
