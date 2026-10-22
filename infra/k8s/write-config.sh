#!/bin/bash
# =============================================================================
# write-config.sh — materialise an environment's GitHub secrets and variables for GKE (PAD-702)
#
# delivery.k8s-manifests rule 9. Run by the GKE deploy workflow (PAD-703) on the runner, with every
# key of overlays/<env>/sources.txt in its environment under the ENV KEY's name (the workflow's
# `env:` block maps `JWT_SECRET_KEY: ${{ secrets.STAGING_JWT_SECRET_KEY }}` and so on; nothing is
# interpolated into a script):
#
#   bash infra/k8s/write-config.sh <staging|prod> <secret-dir>
#
#   - class secret: one file per key in <secret-dir> (0700 dir, 0600 files), for
#     `kubectl create secret generic levapp-secrets --from-file=<secret-dir>`. One file per key,
#     not an env file: a value may span lines (a PEM key). An empty secret fails, naming the key;
#   - class var / context: KEY=value lines in overlays/<env>/config/vars.env (gitignored), read by
#     the ConfigMap generator after the template. A value with a newline fails;
#   - prints one line, `secrets-sha256 <hex>`, a hash of the sorted keys and values, for the
#     pod-template annotation levapp.app/secrets-sha256: a changed secret rolls the pods.
# Never prints a value.
# =============================================================================
set -euo pipefail
ENV_NAME="${1:?usage: write-config.sh <staging|prod> <secret-dir>}"
OUT="${2:?usage: write-config.sh <staging|prod> <secret-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCES="$HERE/overlays/$ENV_NAME/sources.txt"
VARS="${VARS_FILE:-$HERE/overlays/$ENV_NAME/config/vars.env}"  # VARS_FILE: tests only
[ -f "$SOURCES" ] || { echo "::error::no $SOURCES" >&2; exit 2; }

umask 077
mkdir -p "$OUT"; chmod 700 "$OUT"
: > "$VARS"
missing=()
while read -r key class _source; do
  case "$key" in ''|'#'*) continue ;; esac
  value="${!key-}"
  case "$class" in
    secret)
      if [ -z "$value" ]; then missing+=("$key"); continue; fi
      printf '%s' "$value" > "$OUT/$key" ;;
    var|context)
      case "$value" in *$'\n'*) echo "::error::$key: a variable may not span lines" >&2; exit 1 ;; esac
      printf '%s=%s\n' "$key" "$value" >> "$VARS" ;;
    *) echo "::error::$SOURCES: unknown class '$class' for $key" >&2; exit 2 ;;
  esac
done < "$SOURCES"
if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error::empty secret(s) for $ENV_NAME: ${missing[*]}" >&2
  exit 1
fi

sha() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }
digest=$(cd "$OUT" && for f in $(ls | LC_ALL=C sort); do printf '%s\0' "$f"; cat "$f"; printf '\0'; done | sha | cut -d' ' -f1)
echo "secrets-sha256 $digest"
