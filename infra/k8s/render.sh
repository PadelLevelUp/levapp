#!/bin/bash
# =============================================================================
# render.sh — one environment's manifests, ready to apply (PAD-703, delivery.k8s-manifests rule 11)
#
#   REGISTRY=docker.io/<user> IMAGE_TAG=<sha> GSA_BACKEND=<email> [SECRETS_SHA256=<hex>] \
#     bash infra/k8s/render.sh <staging|prod> <app|migrate>
#
# Renders overlays/<env> (app) or overlays/<env>/migrate (migrate), reading backend/.env.<env>
# (LoadRestrictionsNone, rule 8), and fills the placeholders the repository keeps instead of
# identifiers (R-036): REGISTRY/levelup_* images and their tags, GSA_BACKEND, SECRETS_SHA256 (app
# only). Fails if a value is missing or malformed, or a placeholder is left. Prints YAML only.
# =============================================================================
set -euo pipefail
ENV_NAME="${1:?usage: render.sh <staging|prod> <app|migrate>}"
PART="${2:?usage: render.sh <staging|prod> <app|migrate>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
case "$PART" in
  app) DIR="$HERE/overlays/$ENV_NAME" ;;
  migrate) DIR="$HERE/overlays/$ENV_NAME/migrate"; SECRETS_SHA256="${SECRETS_SHA256:-unused}" ;;
  *) echo "render.sh: part must be app or migrate" >&2; exit 2 ;;
esac
[ -f "$DIR/kustomization.yaml" ] || { echo "render.sh: no $DIR/kustomization.yaml" >&2; exit 2; }
check() {  # name, value, pattern: never a sed delimiter, a quote or a space
  [ -n "$2" ] || { echo "render.sh: $1 is empty" >&2; exit 1; }
  [[ "$2" =~ ^$3$ ]] || { echo "render.sh: $1 is malformed" >&2; exit 1; }
}
check REGISTRY "${REGISTRY:-}" '[A-Za-z0-9._/-]+'
check IMAGE_TAG "${IMAGE_TAG:-}" '[A-Za-z0-9._-]+'
check GSA_BACKEND "${GSA_BACKEND:-}" '[A-Za-z0-9._@-]+'
check SECRETS_SHA256 "${SECRETS_SHA256:-}" '[A-Za-z0-9]+'
touch "$HERE/overlays/$ENV_NAME/config/vars.env"   # the deploy writes it first; a render alone needs it to exist
out=$(kubectl kustomize --load-restrictor LoadRestrictionsNone "$DIR" | sed -E \
  -e "s|REGISTRY/(levelup_[a-z]+):[A-Za-z0-9._-]+|${REGISTRY}/\\1:${IMAGE_TAG}|g" \
  -e "s|GSA_BACKEND|${GSA_BACKEND}|g" \
  -e "s|SECRETS_SHA256|${SECRETS_SHA256}|g")
if grep -qE 'REGISTRY/|GSA_BACKEND|SECRETS_SHA256' <<<"$out"; then
  echo "render.sh: a placeholder is left in the $ENV_NAME $PART render" >&2; exit 1
fi
printf '%s\n' "$out"
