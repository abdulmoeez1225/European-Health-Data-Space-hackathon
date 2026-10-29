#!/usr/bin/env bash
# Deploys origin/main on the server with Docker Compose (app + Caddy). Run as root.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP=/opt/gatekeeper
ENV_FILE=/etc/gatekeeper.env

if ! docker compose version >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2 docker-buildx
fi
grep -q '^SITE_HOST=' "$ENV_FILE" || { echo "SITE_HOST missing in $ENV_FILE" >&2; exit 1; }

git -C "$APP" -c safe.directory="$APP" fetch -q origin
git -C "$APP" -c safe.directory="$APP" reset -q --hard origin/main

# Caddy takes over ports 80/443 from a host nginx, if one is left from an older setup.
if systemctl is-active -q nginx 2>/dev/null; then systemctl disable -q --now nginx; fi
mkdir -p /var/lib/gatekeeper/state /var/lib/gatekeeper/cache
chown -R 10001 /var/lib/gatekeeper

cd "$APP"
docker compose -f compose.yaml -f compose.prod.yaml --env-file "$ENV_FILE" up -d --build --remove-orphans --wait
docker image prune -f >/dev/null
docker compose -f compose.yaml -f compose.prod.yaml --env-file "$ENV_FILE" ps --format '{{.Name}} {{.Status}}'
echo "deployed $(git -C "$APP" -c safe.directory="$APP" log --oneline -1)"
