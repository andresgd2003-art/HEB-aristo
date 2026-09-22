Pregunta: ¿Cuánto vendió T02 en julio?
SELECT ROUND(SUM(venta_neta_mxn), 2) AS venta_neta FROM ventas WHERE tienda_id = 'T02' AND fecha BETWEEN '2026-07-01' AND '2026-07-31'

Pregunta: ¿Cuánto se vendió en total por Ecommerce en agosto?
SELECT ROUND(SUM(venta_neta_mxn), 2) AS venta_neta FROM ventas WHERE canal = 'Ecommerce' AND fecha BETWEEN '2026-08-01' AND '2026-08-31'

Pregunta: Ventas por tienda en el trimestre
SELECT t.tienda_id, t.nombre, ROUND(SUM(v.venta_neta_mxn), 2) AS venta_neta FROM ventas v JOIN tiendas t USING (tienda_id) GROUP BY 1, 2 ORDER BY venta_neta DESC

Pregunta: ¿Cuántas unidades de leche entera se vendieron en el periodo?
SELECT SUM(v.unidades) AS unidades FROM ventas v JOIN catalogo_productos c USING (sku) WHERE c.nombre ILIKE '%leche entera%'

Pregunta: ¿Qué productos están bajo su punto de reorden en Tienda Valle Norte?
SELECT i.sku, c.nombre, i.existencia, i.punto_reorden FROM inventario i JOIN catalogo_productos c USING (sku) JOIN tiendas t USING (tienda_id) WHERE t.nombre ILIKE '%valle norte%' AND i.existencia < i.punto_reorden ORDER BY i.existencia

Pregunta: ¿Cuántos productos caducan antes del 15 de septiembre?
SELECT COUNT(*) AS productos FROM inventario WHERE fecha_caducidad_lote_proximo < '2026-09-15'

Pregunta: ¿Cuántos tickets siguen abiertos?
SELECT COUNT(*) AS tickets_abiertos FROM tickets_mesa_servicio WHERE estado IN ('Abierto', 'En proceso')

Pregunta: ¿Cuál fue el monto de devoluciones en junio?
SELECT ROUND(SUM(venta_neta_mxn), 2) AS devoluciones, SUM(unidades) AS unidades FROM ventas WHERE unidades < 0 AND fecha BETWEEN '2026-06-01' AND '2026-06-30'

Pregunta: ¿Cuál es la categoría que más vende en T03?
SELECT c.categoria, ROUND(SUM(v.venta_neta_mxn), 2) AS venta_neta FROM ventas v JOIN catalogo_productos c USING (sku) WHERE v.tienda_id = 'T03' GROUP BY 1 ORDER BY venta_neta DESC LIMIT 1

Pregunta: ¿Cuántos tickets críticos hubo por tienda?
SELECT tienda_id, COUNT(*) AS tickets_criticos FROM tickets_mesa_servicio WHERE prioridad = 'Crítica' GROUP BY 1 ORDER BY 2 DESC

Pregunta: ¿Cuál es el margen bruto de Lácteos en agosto?
SELECT ROUND(SUM(v.venta_neta_mxn - v.unidades * c.costo_mxn), 2) AS margen_bruto FROM ventas v JOIN catalogo_productos c USING (sku) WHERE c.categoria = 'Lácteos' AND v.fecha BETWEEN '2026-08-01' AND '2026-08-31'

Pregunta: ¿Cuántos tickets de producto caducado en anaquel hubo?
SELECT titulo, COUNT(*) AS tickets FROM tickets_mesa_servicio WHERE titulo ILIKE '%caducad%' OR descripcion ILIKE '%caducad%' GROUP BY 1 ORDER BY 2 DESC

Pregunta: ¿Cuántos tickets hubo por fallas de la impresora PrintMax TX-200?
SELECT titulo, COUNT(*) AS tickets FROM tickets_mesa_servicio WHERE titulo ILIKE '%printmax%' OR descripcion ILIKE '%printmax%' GROUP BY 1 ORDER BY 2 DESC

Pregunta: ¿Cuántos tickets reportaron refrigeradores sin frío?
SELECT titulo, COUNT(*) AS tickets FROM tickets_mesa_servicio WHERE titulo ILIKE '%refri%' OR descripcion ILIKE '%refri%' OR titulo ILIKE '%frio%' OR descripcion ILIKE '%frio%' GROUP BY 1 ORDER BY 2 DESC

Pregunta: ¿Qué tienda tiene más merma?
NO_RESPONDIBLE: no hay datos de merma en las tablas; solo ventas, inventario, catálogo, tiendas y tickets.

Pregunta: ¿Cuál fue el artículo menos vendido en T01 el 16 de julio?
SELECT v.sku, c.nombre, SUM(v.unidades) AS unidades, ROUND(SUM(v.venta_neta_mxn), 2) AS venta_neta FROM ventas v JOIN catalogo_productos c USING (sku) WHERE v.tienda_id = 'T01' AND v.fecha = '2026-07-16' AND v.unidades > 0 GROUP BY v.sku, c.nombre HAVING SUM(v.unidades) = (SELECT MIN(u) FROM (SELECT SUM(unidades) AS u FROM ventas WHERE tienda_id = 'T01' AND fecha = '2026-07-16' AND unidades > 0 GROUP BY sku) m) ORDER BY venta_neta

Pregunta: ¿Qué tiendas llevan más de un día sin contar panadería, carnes o frutas y verduras?
SELECT i.tienda_id, c.categoria, COUNT(*) AS posiciones_sin_conteo_reciente, MAX(i.fecha_ultimo_conteo) AS ultimo_conteo FROM inventario i JOIN catalogo_productos c USING (sku) WHERE c.categoria IN ('Panadería', 'Carnes', 'Frutas y verduras') AND i.fecha_ultimo_conteo < DATE '2026-09-01' GROUP BY 1, 2 ORDER BY 1, 2
-- inventario es una foto al 1 de septiembre de 2026: la antigüedad del conteo se mide con fecha_ultimo_conteo contra esa fecha; no hay histórico diario.
