#!/bin/sh
# Ticket 14: publica web/ en https://heb.stingai.org (contenedor nginx con etiquetas de Traefik en la red easypanel; no pasa por el panel).
# Uso: sh infra/desplegar-web.sh   (lee VPS_KEY y VPS_HOST de .env)
set -e; . ./.env
ssh -i "$VPS_KEY" root@"$VPS_HOST" 'mkdir -p /opt/heb-web'
scp -q -i "$VPS_KEY" web/index.html web/heb.svg web/Dockerfile web/nginx.conf root@"$VPS_HOST":/opt/heb-web/
# El script remoto va en un heredoc con comillas: las comillas invertidas de Host(`...`) llegan intactas a docker.
ssh -i "$VPS_KEY" root@"$VPS_HOST" 'sh -s' <<'REMOTO'
set -e; cd /opt/heb-web && docker build -q -t heb-web:1 . && docker rm -f heb-web >/dev/null 2>&1 || true
docker run -d --name heb-web --restart unless-stopped --network easypanel \
  -l traefik.enable=true \
  -l 'traefik.http.routers.heb-web.rule=Host(`heb.stingai.org`)' \
  -l traefik.http.routers.heb-web.entrypoints=https \
  -l traefik.http.routers.heb-web.tls.certresolver=letsencrypt \
  -l 'traefik.http.routers.heb-web-http.rule=Host(`heb.stingai.org`)' \
  -l traefik.http.routers.heb-web-http.entrypoints=http \
  -l traefik.http.routers.heb-web-http.middlewares=redirect-to-https@file \
  -l traefik.http.services.heb-web.loadbalancer.server.port=80 heb-web:1 >/dev/null
REMOTO
sleep 5; curl -s -o /dev/null -w "https://heb.stingai.org -> %{http_code}\n" https://heb.stingai.org/
