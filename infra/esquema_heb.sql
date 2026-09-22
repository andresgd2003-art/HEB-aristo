-- Esquema `heb`: los 5 CSV de datos/ con tipos reales, en el Postgres compartido con BANO.
-- Idempotente: borra y recrea. Los COMMENT son la semantica que lee el agente SQL (ticket 04):
-- ahi viven las trampas T1/T2/T7/T8 de la auditoria, no en el corpus RAG.

DROP SCHEMA IF EXISTS heb CASCADE;
CREATE SCHEMA heb;
COMMENT ON SCHEMA heb IS 'Datos sinteticos de 4 tiendas H-E-B. Ventas 2026-06-01..2026-08-31; inventario al corte 2026-09-01; tickets jun-ago 2026. Montos en MXN.';

CREATE TABLE heb.tiendas (
  tienda_id      text PRIMARY KEY,
  nombre         text NOT NULL,
  ciudad         text NOT NULL,
  estado         text NOT NULL,
  formato        text NOT NULL CHECK (formato IN ('Supermercado', 'Mi Tienda')),
  m2             integer NOT NULL,
  fecha_apertura date NOT NULL
);
COMMENT ON TABLE heb.tiendas IS '4 tiendas T01..T04. Solo el formato Supermercado (T01, T02) tiene canal Ecommerce; en Mi Tienda (T03, T04) las ventas online son 0 por diseno, no por falta de dato.';

CREATE TABLE heb.catalogo_productos (
  sku              text PRIMARY KEY,
  nombre           text NOT NULL,
  categoria        text NOT NULL,
  subcategoria     text NOT NULL,
  perecedero       boolean NOT NULL,
  vida_util_dias   integer NOT NULL,
  precio_lista_mxn numeric(10,2) NOT NULL,
  costo_mxn        numeric(10,2) NOT NULL,
  proveedor_id     text NOT NULL,
  estatus          text NOT NULL CHECK (estatus IN ('Activo', 'Descontinuado')),
  fecha_alta       date NOT NULL,
  fecha_baja       date,
  sku_sustituto    text REFERENCES heb.catalogo_productos (sku)
);
COMMENT ON TABLE heb.catalogo_productos IS '121 SKU en 8 categorias. Un SKU Descontinuado tiene fecha_baja (ultimo dia que vendio) y normalmente sku_sustituto: para preguntas por producto (ej. "leche entera") hay que sumar el SKU viejo y su sustituto. Caso real: SKU-1001 -> SKU-1121 desde 2026-07-15.';
COMMENT ON COLUMN heb.catalogo_productos.precio_lista_mxn IS 'Por unidad de venta (pieza, kg o paquete segun el nombre), sin descuento.';

CREATE TABLE heb.ventas (
  fecha          date NOT NULL,
  tienda_id      text NOT NULL REFERENCES heb.tiendas (tienda_id),
  sku            text NOT NULL REFERENCES heb.catalogo_productos (sku),
  unidades       integer NOT NULL,
  venta_neta_mxn numeric(12,2) NOT NULL,
  descuento_mxn  numeric(12,2) NOT NULL,
  canal          text NOT NULL CHECK (canal IN ('Piso', 'Ecommerce'))
);
-- SIN clave primaria a proposito (T1): una devolucion es una fila aparte con unidades y
-- venta_neta negativas y puede compartir (fecha, tienda, sku, canal) con la venta del dia.
-- 409 pares asi en el periodo. Nunca deduplicar.
CREATE INDEX ventas_tienda_fecha ON heb.ventas (tienda_id, fecha);
CREATE INDEX ventas_sku ON heb.ventas (sku);
COMMENT ON TABLE heb.ventas IS 'Una fila por dia, tienda, SKU y canal con venta; los dias sin venta no aparecen. Las devoluciones son filas con unidades y venta_neta_mxn NEGATIVAS y pueden coincidir en llave con la venta del dia (no hay PK): SUM() ya las descuenta; para separar ventas brutas de devoluciones filtrar por signo de unidades. venta_neta_mxn = unidades * precio - descuento_mxn.';

CREATE TABLE heb.inventario (
  tienda_id                     text NOT NULL REFERENCES heb.tiendas (tienda_id),
  sku                           text NOT NULL REFERENCES heb.catalogo_productos (sku),
  existencia                    integer NOT NULL,
  punto_reorden                 integer NOT NULL,
  fecha_ultimo_conteo           date NOT NULL,
  fecha_caducidad_lote_proximo  date,
  PRIMARY KEY (tienda_id, sku)
);
COMMENT ON TABLE heb.inventario IS 'Snapshot al 2026-09-01 por tienda y SKU activo (480 filas; no hay historico). "Bajo punto de reorden" = existencia < punto_reorden (17 casos). fecha_caducidad_lote_proximo solo en perecederos; NULL en los demas.';

CREATE TABLE heb.tickets_mesa_servicio (
  ticket_id      integer PRIMARY KEY,
  fecha_creacion timestamp NOT NULL,
  tienda_id      text NOT NULL REFERENCES heb.tiendas (tienda_id),
  categoria      text NOT NULL CHECK (categoria IN ('TI', 'Mantenimiento', 'RH', 'Inventario', 'Cajas')),
  prioridad      text NOT NULL CHECK (prioridad IN ('Baja', 'Media', 'Alta', 'Crítica')),
  estado         text NOT NULL CHECK (estado IN ('Abierto', 'En proceso', 'Resuelto', 'Cerrado')),
  titulo         text NOT NULL,
  descripcion    text NOT NULL,
  fecha_cierre   timestamp
);
CREATE INDEX tickets_tienda_fecha ON heb.tickets_mesa_servicio (tienda_id, fecha_creacion);
COMMENT ON TABLE heb.tickets_mesa_servicio IS '285 tickets (folios 1001..1285), hora local de Monterrey. Texto libre coloquial con errores de dedo; muchas descripciones son plantillas repetidas entre tiendas, asi que "cuantos tickets de X" se agrupa por titulo/categoria (ILIKE), no por texto exacto. "Abiertos" = estado IN (Abierto, En proceso). Datos personales de colaboradores redactados en la carga.';

-- Usuario de solo lectura para el agente (ticket 04). La clave la pone cargar_datos.sh.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heb_lector') THEN
    CREATE ROLE heb_lector LOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA heb TO heb_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA heb TO heb_lector;
ALTER ROLE heb_lector SET search_path = heb;
ALTER ROLE heb_lector SET statement_timeout = '15s';
