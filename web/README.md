# Chat web de HEB-aristo (ticket 14)

Una sola página estática (`index.html`, sin framework) servida por nginx, calcada del chat del portafolio (BANO).
Habla con el proxy `HEB-aristo — Web (proxy)` de n8n (`infra/crear-web.mjs`): texto por JSON, voz por multipart (MediaRecorder → Whisper).

Despliegue: app de Easypanel con este Dockerfile y dominio `heb.stingai.org` (A → 148.230.82.14).
