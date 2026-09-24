#!/usr/bin/env bash
# B-182 (PAD-435): prove an nginx config keeps SSE access tokens out of its logs.
#
#   bash infra/nginx/check-log-redaction.sh [CONFIG_DIR]            the host config (default: here)
#   bash infra/nginx/check-log-redaction.sh --web <nginx.conf>      the web container's config
#   SHOW_LOG=1 …                                                    also print both logs
#
# Host mode: CONFIG_DIR holds nginx.conf, sites-available/ and, optionally, conf.d/, laid out as
# on the VM. It runs the VM's nginx (Debian image, `user www-data`) with self-signed stand-ins
# for the Let's Encrypt files and sends a token-bearing request to every vhost on every port it
# serves. Web mode runs the web image's nginx (alpine) with the file as conf.d/default.conf.
#
# Both then send a control request and fail if the token is in access.log or error.log, if a
# token request was not logged at all, or if the control request lost its query. Upstreams are
# down, so every proxied request is a 502, which is what makes nginx write the request line into
# error.log, the second place a token can leak.
set -euo pipefail

SECRET="b182-leak-canary-$RANDOM$RANDOM"
NAME="b182-nginx-check-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Stand-in certificates for every Let's Encrypt path the vhosts name, then nginx in the foreground.
BOOT='
  set -e
  mkdir -p /etc/nginx/modules-enabled /etc/letsencrypt
  for d in $(cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -o "/etc/letsencrypt/live/[^/]*" | sort -u); do
    mkdir -p "$d"
    openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=${d##*/}" \
      -keyout "$d/privkey.pem" -out "$d/fullchain.pem" 2>/dev/null
  done
  if ls /etc/nginx/sites-enabled/* >/dev/null 2>&1; then
    : > /etc/letsencrypt/options-ssl-nginx.conf
    openssl dhparam -dsaparam -out /etc/letsencrypt/ssl-dhparams.pem 2048 2>/dev/null
  fi
  rm -f /var/log/nginx/access.log /var/log/nginx/error.log
  nginx -t
  exec nginx -g "daemon off;"
'

sent=0
request() { docker exec "$NAME" curl -sk -o /dev/null "$@"; }

if [ "${1:-}" = "--web" ]; then
  CONF="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
  docker run -d --name "$NAME" -v "$CONF:/etc/nginx/conf.d/default.conf:ro" \
    "${NGINX_WEB_IMAGE:-nginx:1.27-alpine}" sh -c "$BOOT" >/dev/null
  hosts="localhost"
else
  DIR="$(cd "${1:-$(dirname "$0")}" && pwd)"
  mounts=(-v "$DIR/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$DIR/sites-available:/etc/nginx/sites-enabled:ro")
  [ -d "$DIR/conf.d" ] && mounts+=(-v "$DIR/conf.d:/etc/nginx/conf.d:ro")
  docker run -d --name "$NAME" "${mounts[@]}" "${NGINX_IMAGE:-nginx:1.27}" sh -c "$BOOT" >/dev/null
fi

for _ in $(seq 1 60); do
  docker exec "$NAME" sh -c 'test -s /run/nginx.pid || test -s /var/run/nginx.pid' 2>/dev/null && break
  sleep 1
done
if ! docker exec "$NAME" sh -c 'test -s /run/nginx.pid || test -s /var/run/nginx.pid' 2>/dev/null; then
  docker logs "$NAME" 2>&1 | tail -20
  echo "FAIL: nginx did not start"
  exit 1
fi

if [ "${1:-}" = "--web" ]; then
  request "http://127.0.0.1/api/app/events?token=$SECRET"; sent=1
  request "http://127.0.0.1/api/app/players?page=2"
else
  # Every vhost (its first server_name) on 443, and on 80 where its file has a port-80 block.
  hosts=$(docker exec "$NAME" sh -c "cat /etc/nginx/sites-enabled/* | grep -o 'server_name [^;]*' | awk '{print \$2}' | sort -u")
  for h in $hosts; do
    request --resolve "$h:443:127.0.0.1" "https://$h/api/app/events?token=$SECRET"
    sent=$((sent + 1))
    if docker exec "$NAME" sh -c "grep -l 'server_name $h' /etc/nginx/sites-enabled/* | xargs grep -qs 'listen 80'"; then
      request -H "Host: $h" "http://127.0.0.1/api/app/events?token=$SECRET"
      sent=$((sent + 1))
    fi
  done
  first=$(echo "$hosts" | head -1)
  request --resolve "$first:443:127.0.0.1" "https://$first/api/app/players?page=2"
fi
sleep 1

access=$(docker exec "$NAME" cat /var/log/nginx/access.log)
errors=$(docker exec "$NAME" cat /var/log/nginx/error.log 2>/dev/null || true)
fail=0
[ -n "${SHOW_LOG:-}" ] && printf '%s\n--- error.log ---\n%s\n' "$access" "$errors"
if grep -q "$SECRET" <<<"$access"; then echo "FAIL: the token is in access.log ($(grep -c "$SECRET" <<<"$access") lines)"; fail=1; fi
if grep -q "$SECRET" <<<"$errors"; then echo "FAIL: the token is in error.log ($(grep -c "$SECRET" <<<"$errors") lines)"; fail=1; fi
logged=$(grep -c "/api/app/events" <<<"$access" || true)
if [ "$logged" -ne "$sent" ]; then echo "FAIL: $sent token requests sent, $logged logged (redaction must not drop the line)"; fail=1; fi
if ! grep -q "/api/app/players?page=2" <<<"$access"; then echo "FAIL: the control request lost its query string"; fail=1; fi
[ "$fail" -eq 0 ] && echo "OK: $sent token requests across $(echo $hosts | wc -w | tr -d ' ') hosts logged without the token; control query kept"
exit "$fail"
