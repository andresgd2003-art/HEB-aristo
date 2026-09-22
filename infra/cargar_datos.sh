#!/usr/bin/env bash
# Carga datos/*.csv al esquema `heb` del Postgres de BANO (contenedor bano_postgres en el VPS).
# Repetible: esquema_heb.sql borra y recrea el esquema. Se ejecuta desde la maquina local.
#
# Uso: infra/cargar_datos.sh            (lee VPS_HOST, VPS_KEY, HEB_LECTOR_PASSWORD de .env)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${VPS_HOST:?falta VPS_HOST en .env}" "${VPS_KEY:?falta VPS_KEY}" "${HEB_LECTOR_PASSWORD:?falta HEB_LECTOR_PASSWORD}"
SSH="ssh -i $VPS_KEY -o BatchMode=yes root@$VPS_HOST"
C=bano_postgres; PSQL="docker exec -i $C psql -U bano -d bano -v ON_ERROR_STOP=1"

tar cz -C . datos/*.csv infra/esquema_heb.sql | $SSH 'rm -rf /tmp/heb && mkdir -p /tmp/heb && tar xz -C /tmp/heb'
$SSH "docker cp /tmp/heb/. $C:/tmp/heb/ && $PSQL -q -f /tmp/heb/infra/esquema_heb.sql"

# \copy con el orden de columnas del CSV. tickets: '' -> NULL en fecha_cierre lo hace CSV por defecto.
$SSH "$PSQL -q" <<'SQL'
\copy heb.tiendas FROM '/tmp/heb/datos/tiendas.csv' CSV HEADER
\copy heb.catalogo_productos FROM '/tmp/heb/datos/catalogo_productos.csv' CSV HEADER
\copy heb.ventas FROM '/tmp/heb/datos/ventas.csv' CSV HEADER
\copy heb.inventario FROM '/tmp/heb/datos/inventario.csv' CSV HEADER
\copy heb.tickets_mesa_servicio FROM '/tmp/heb/datos/tickets_mesa_servicio.csv' CSV HEADER
-- T5: datos personales de colaboradores en texto libre (FAQ-OPS-001 P24). Generico, no por folio.
UPDATE heb.tickets_mesa_servicio SET descripcion =
  regexp_replace(regexp_replace(descripcion,
    '\d{3}[.\- ]\d{3}[.\- ]\d{4}', '[telefono omitido]', 'g'),
    '(Reporta|Atiende|Contacto:?)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}', '\1 [nombre omitido]', 'g')
WHERE descripcion ~ '\d{3}[.\- ]\d{3}[.\- ]\d{4}' OR descripcion ~ '(Reporta|Atiende|Contacto:?)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ]';
ANALYZE;
SQL

$SSH "$PSQL -q -c \"ALTER ROLE heb_lector PASSWORD '$HEB_LECTOR_PASSWORD';\" && rm -rf /tmp/heb && docker exec $C rm -rf /tmp/heb"

# Verificacion: conteos del diccionario + las 3 consultas de control del ticket 02.
$SSH "$PSQL -tA" <<'SQL'
SELECT 'tiendas', count(*) FROM heb.tiendas UNION ALL SELECT 'catalogo', count(*) FROM heb.catalogo_productos
UNION ALL SELECT 'ventas', count(*) FROM heb.ventas UNION ALL SELECT 'inventario', count(*) FROM heb.inventario
UNION ALL SELECT 'tickets', count(*) FROM heb.tickets_mesa_servicio;
SELECT 'venta_neta '||tienda_id, sum(venta_neta_mxn) FROM heb.ventas GROUP BY 1 ORDER BY 1;
SELECT 'bajo_reorden', count(*) FROM heb.inventario WHERE existencia < punto_reorden;
SELECT 'tickets_abiertos', count(*) FROM heb.tickets_mesa_servicio WHERE estado IN ('Abierto','En proceso');
SELECT 'pii_restante', count(*) FROM heb.tickets_mesa_servicio WHERE descripcion ~ '\d{3}[.\- ]\d{3}[.\- ]\d{4}';
SELECT 'ticket_1043', descripcion FROM heb.tickets_mesa_servicio WHERE ticket_id = 1043;
SQL
