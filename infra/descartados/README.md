# Scripts de construcción por etapas (archivados)

Sirvieron para construir y medir HEB-aristo ticket a ticket; ya no se ejecutan. La fuente de verdad son los JSON de
`workflows/` más `prompts/sistema.md`, `infra/esquema_para_el_agente.md`, `infra/ejemplos_sql.md` y `infra/guarda_sql.js`,
que `infra/crear-flujos.mjs` importa y sincroniza.

- `crear-consultas-sql.mjs` — variantes A/B del agente SQL como sub-flujos + flujo TEST blue/green (ticket 04).
- `crear-consultas-politicas.mjs` — sub-agente solo para RAG vs herramienta directa (ticket 05).
- `crear-test-sql.mjs` — primer flujo TEST del hijo SQL.
- `limpiar_identidad.mjs` — limpieza de identidad BANO tras duplicar los flujos (ticket 11). La copia inicial la hizo
  `infra/crear-heb-aristo.mjs` del repositorio de BANO.
