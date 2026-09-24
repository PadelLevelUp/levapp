#!/usr/bin/env bash
# B-182, B-183 (PAD-435): prove an nginx config keeps URL secrets (the SSE token, the activation
# link's ?t=, the account lookup's ?token=, and a Referer carrying one) out of its logs.
#
#   bash infra/nginx/check-log-redaction.sh [CONFIG_DIR]            the host config (default: here)
#   bash infra/nginx/check-log-redaction.sh --web <nginx.conf>      the web container's config
#   SHOW_LOG=1 …                                                    also print both logs
#
# Host mode: CONFIG_DIR holds nginx.conf, sites-available/ and, optionally, conf.d/, laid out as
# on the VM. It runs the VM's nginx (Debian image, `user www-data`) with self-signed stand-ins
# for the Let's Encrypt files and sends each secret-bearing request to every vhost on every port it
# serves. Web mode runs the web image's nginx (alpine) with the file as conf.d/default.conf.
#
# Both then send a control request, whose Referer holds the secret, and fail if the secret is in
# access.log or error.log, if a secret-bearing request was not logged redacted, or if the control
# request lost its query. Upstreams are
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
policy_missing=""
request() { docker exec "$NAME" curl -sk -o /dev/null "$@"; }
# The activation page must tell the browser to send no Referer (B-183).
expect_no_referrer() {
  docker exec "$NAME" curl -sk -o /dev/null -D - "$@" | tr -d '\r' | grep -qix "referrer-policy: no-referrer" \
    || policy_missing="$policy_missing ${*: -1}"
}

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

# The URLs that carry a secret: the SSE token (B-182), and the activation page's ?t= plus the
# account lookup's ?token= (B-183).
SECRET_PATHS=("/api/app/events?token=$SECRET" "/register/7?t=$SECRET" "/api/app/register/user/7?token=$SECRET")
# The control: a query that must survive, from a page whose URL (the Referer) holds the secret.
CONTROL_PATH="/api/app/players?page=2"
REFERER_PATH="/register/7?t=$SECRET"

if [ "${1:-}" = "--web" ]; then
  for p in "${SECRET_PATHS[@]}"; do request "http://127.0.0.1$p"; sent=$((sent + 1)); done
  expect_no_referrer "http://127.0.0.1/register/7"
  request -H "Referer: http://localhost$REFERER_PATH" "http://127.0.0.1$CONTROL_PATH"
else
  # Every vhost (its first server_name) on 443, and on 80 where its file has a port-80 block.
  hosts=$(docker exec "$NAME" sh -c "cat /etc/nginx/sites-enabled/* | grep -o 'server_name [^;]*' | awk '{print \$2}' | sort -u")
  for h in $hosts; do
    expect_no_referrer --resolve "$h:443:127.0.0.1" "https://$h/register/7"
    port80=0
    docker exec "$NAME" sh -c "grep -l 'server_name $h' /etc/nginx/sites-enabled/* | xargs grep -qs 'listen 80'" && port80=1
    for p in "${SECRET_PATHS[@]}"; do
      request --resolve "$h:443:127.0.0.1" "https://$h$p"
      sent=$((sent + 1))
      if [ "$port80" -eq 1 ]; then request -H "Host: $h" "http://127.0.0.1$p"; sent=$((sent + 1)); fi
    done
  done
  first=$(echo "$hosts" | head -1)
  request --resolve "$first:443:127.0.0.1" -H "Referer: https://$first$REFERER_PATH" "https://$first$CONTROL_PATH"
fi
sleep 1

access=$(docker exec "$NAME" cat /var/log/nginx/access.log)
errors=$(docker exec "$NAME" cat /var/log/nginx/error.log 2>/dev/null || true)
fail=0
[ -n "${SHOW_LOG:-}" ] && printf '%s\n--- error.log ---\n%s\n' "$access" "$errors"
if grep -q "$SECRET" <<<"$access"; then echo "FAIL: the token is in access.log ($(grep -c "$SECRET" <<<"$access") lines)"; fail=1; fi
# The control request forges the Referer a browser no longer sends (Referrer-Policy: no-referrer);
# nginx prints a Referer into error.log on an upstream error and no format redacts that line, so
# it is the one error.log line allowed to hold the secret. access.log must still drop it.
leaks=$(grep "$SECRET" <<<"$errors" | grep -v "request: \"GET $CONTROL_PATH " || true)
if [ -n "$leaks" ]; then echo "FAIL: the token is in error.log ($(grep -c . <<<"$leaks") lines)"; fail=1; fi
if [ -n "$policy_missing" ]; then echo "FAIL: no 'Referrer-Policy: no-referrer' on:$policy_missing"; fail=1; fi
logged=$(grep -c '?\[redacted\] HTTP/' <<<"$access" || true)
if [ "$logged" -ne "$sent" ]; then echo "FAIL: $sent secret-bearing requests sent, $logged logged redacted (each must be logged, with its query cut)"; fail=1; fi
if ! grep -q "$CONTROL_PATH" <<<"$access"; then echo "FAIL: the control request lost its query string"; fail=1; fi
[ "$fail" -eq 0 ] && echo "OK: $sent secret-bearing requests across $(echo $hosts | wc -w | tr -d ' ') hosts logged redacted; the secret is in neither log; access.log drops it from the Referer; /register/ sends Referrer-Policy: no-referrer; control query kept"
exit "$fail"
