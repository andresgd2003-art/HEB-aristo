Base PostgreSQL, esquema `heb`. Cada tabla viene de un archivo CSV que el usuario conoce por nombre: tiendas ← tiendas.csv, catalogo_productos ← catalogo_productos.csv, ventas ← ventas.csv, inventario ← inventario.csv, tickets_mesa_servicio ← tickets_mesa_servicio.csv. Al responder incluye el archivo de origen ("fuente: ventas.csv"). (search_path ya apunta a heb; no prefijar). Datos sintéticos de 4 tiendas.
Periodo de ventas: 2026-06-01 a 2026-08-31. Inventario: foto al 2026-09-01. Tickets: jun-ago 2026. Montos en MXN. Hoy es 2026-09-01 para efectos de "este mes"/"último mes" (agosto es el último mes completo).

tiendas(tienda_id PK 'T01'..'T04', nombre, ciudad, estado, formato 'Supermercado'|'Mi Tienda', m2, fecha_apertura)
  - Solo Supermercado (T01, T02) tiene canal Ecommerce. En T03/T04 (Mi Tienda) las ventas online son 0 por diseño: usa COALESCE(SUM(...), 0) para que el resultado sea 0 y no NULL.

catalogo_productos(sku PK 'SKU-NNNN', nombre, categoria, subcategoria, perecedero bool, vida_util_dias, precio_lista_mxn, costo_mxn, proveedor_id, estatus 'Activo'|'Descontinuado', fecha_alta, fecha_baja, sku_sustituto FK)
  - categorias: Lácteos, Panadería, Carnes, Frutas y verduras, Abarrotes, Bebidas, Limpieza, Cuidado personal.
  - Un SKU Descontinuado tiene fecha_baja (último día que vendió) y normalmente sku_sustituto. Para preguntas por producto (ej. "leche entera") sumar el SKU viejo y su sustituto: SKU-1001 -> SKU-1121 desde 2026-07-15.
  - Buscar productos por nombre con ILIKE '%...%' (los nombres traen presentación: "Leche entera 1 L").

ventas(fecha, tienda_id FK, sku FK, unidades int, venta_neta_mxn, descuento_mxn, canal 'Piso'|'Ecommerce')
  - SIN clave primaria: una devolución es una fila aparte con unidades y venta_neta_mxn NEGATIVAS y puede coincidir en (fecha, tienda, sku, canal) con la venta del día. SUM() ya las descuenta. Para "devoluciones" filtrar unidades < 0; para "venta bruta" unidades > 0.
  - Los días sin venta no aparecen. venta_neta_mxn = unidades*precio - descuento_mxn.
  - Margen = venta_neta_mxn - unidades*costo_mxn (join con catalogo). No hay datos de merma en ninguna tabla.

inventario(tienda_id, sku, existencia int, punto_reorden int, fecha_ultimo_conteo, fecha_caducidad_lote_proximo NULL si no perecedero) PK (tienda_id, sku)
  - Foto única al 2026-09-01; no hay histórico. "Bajo punto de reorden" = existencia < punto_reorden.
  - "Caduca pronto" = fecha_caducidad_lote_proximo entre '2026-09-01' y la fecha que pida el usuario.

tickets_mesa_servicio(ticket_id PK int, fecha_creacion timestamp, tienda_id FK, categoria 'TI'|'Mantenimiento'|'RH'|'Inventario'|'Cajas', prioridad 'Baja'|'Media'|'Alta'|'Crítica', estado 'Abierto'|'En proceso'|'Resuelto'|'Cerrado', titulo, descripcion, fecha_cierre NULL si sigue abierto)
  - "Abiertos"/"pendientes" = estado IN ('Abierto','En proceso'). Tiempo de resolución = fecha_cierre - fecha_creacion.
  - Para explicar un evento (caída/pico de ventas en unas fechas) buscar tickets de esa tienda creados desde 30 días ANTES del evento: los avisos de obra/cierre se levantan antes de que ocurran (ej. ticket 1118 del 10-jul avisa la remodelación del 14-16 jul).
  - fecha_creacion y fecha_cierre son TIMESTAMP: para filtrar por día usar fecha_creacion::date BETWEEN ... o fecha_creacion < 'día siguiente'. Un BETWEEN '2026-06-01' AND '2026-08-31' sobre el timestamp DESCARTA todo el 31 de agosto. Si la pregunta no acota fechas, no filtres: los tickets ya son solo de jun-ago.
  - Texto libre con errores de dedo y plantillas repetidas: agrupar por titulo ILIKE o categoria, no por texto exacto. Datos personales ya redactados.
  - Para contar tickets "de X": los títulos son plantillas (≈40 distintas) escritas en coloquial y a veces sin acento ("Se fue la luz en refris", "Refrigerador de carnes no enfria"). Buscar por RAÍCES cortas sin acento con ILIKE sobre titulo Y descripcion (el modelo de un equipo, p. ej. 'PrintMax', solo aparece en la descripción): (titulo ILIKE '%refri%' OR descripcion ILIKE '%refri%'). NO por la frase literal de la pregunta (rara vez coincide) ni por palabras genéricas que atrapan otros temas ('%anaquel%' también es "Anaquel flojo"). Devolver SIEMPRE el desglose: SELECT titulo, COUNT(*) ... GROUP BY titulo, para que quien pregunta vea qué se contó. Nunca incluir recomendaciones ni texto de política como literales en el SQL: la consulta solo devuelve datos.
