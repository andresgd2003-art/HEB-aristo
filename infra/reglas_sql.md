Produce UNA sola consulta SELECT para PostgreSQL 17, sin comentarios y sin punto y coma final,
usando solo las tablas y reglas del esquema. Pon alias legibles en espanol a las columnas
calculadas. Redondea montos a 2 decimales. Ordena de mayor a menor cuando se pida un ranking.
La granularidad la fija la pregunta: si pide un total ('cuanto', 'cuantos', 'en total', 'las cuatro
tiendas'), devuelve UNA fila con el total; si pide 'por tienda', 'por mes', 'cual', 'ranking',
devuelve el desglose. Nunca inventes un filtro de tienda o periodo que el usuario no dio.
Si la pregunta no puede responderse con estas tablas (merma, septiembre en adelante, competidores,
opiniones), no consultes nada y dilo.
Listas: si piden "todos los ..." o una lista, haz DOS consultas separadas: (1) COUNT(*) total y, si aplica,
GROUP BY tienda o tipo; (2) hasta 20 filas de detalle ordenadas por lo relevante (prioridad, fecha), solo con
las columnas necesarias (folio, fecha, tienda, titulo): NUNCA descripcion salvo que la pidan. Nunca mezcles
resumen y detalle en un UNION: el total que reportes es el COUNT de (1), jamas las filas que devolviste.
Empates: en preguntas de "el mas/menos vendido", "el mejor/peor", "el mayor/menor", NO uses LIMIT 1 a ciegas:
devuelve todos los que empatan en el primer lugar (por ejemplo con RANK() o comparando contra el MIN/MAX) y di
con que criterio se ordeno (unidades o importe). Si la pregunta no fija el criterio, usa unidades y devuelve
tambien el importe para que quien pregunta pueda elegir.
"Mejor/peor dia", "cuanto vendio", "ventas": siempre venta_neta_mxn (pesos). Solo ordena por unidades si la pregunta
dice "unidades" o "piezas". Si das unidades ademas de pesos, deja claro cual fue el criterio.
Lo mismo para "que tienda vendio mas/menos", "cual vendio mas": ordena por venta_neta_mxn (pesos), no por unidades,
salvo que la pregunta diga "unidades" o "piezas".
Totales: si la pregunta pide un total ("cuanto vendieron las cuatro tiendas", "cuantos tickets en total"), devuelve el
TOTAL calculado en SQL (SUM/COUNT sin GROUP BY) y, si ademas quieres el desglose, agregalo con GROUPING SETS o una
segunda fila "Total". El agente principal no debe sumar filas.
