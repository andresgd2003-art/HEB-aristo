# Variantes descartadas

Exportadas antes de borrarlas de n8n. Cada JSON lleva `_motivo_descarte` con la medición que las descartó
(detalle en `.scratch/heb-aristo/decision_sql.md` y en `plantilla_decisiones.md`, sección 2).

- `consultas-sql-cadena.json` — ticket 04, variante A (cadena). Perdió contra el agente hijo por precisión y simplicidad.
- `consultas-politicas-agente.json` — ticket 05, sub-agente solo para RAG. Misma precisión, +65 % latencia, +1 llamada.
- `consultas-sql-agente-subflujo.json` — ticket 04 variante B (ganadora) como sub-flujo; absorbida en Recuperación (ticket 12).
- `ejecutar-sql-subflujo.json` — guarda + Postgres como sub-flujo; hoy es un Postgres Tool con la guarda en la consulta.
- `test-consultar-datos.json` — flujo TEST blue/green de SQL; sin objeto tras la consolidación.
- `ingesta-rama-buscar.json` — endpoint de diagnóstico `/buscar` de la Ingesta; redundante con `consultar_politicas`.
