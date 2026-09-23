#!/usr/bin/env bash
# levapp pre-push gate: the smallest local check set that catches what CI fails on, fast enough
# to run before every push (target ≤ 5 min).
#
#   bash .githooks/prepush-gate.sh            # what the hook runs
#   bash .githooks/prepush-gate.sh --full     # + the full backend suite on SQLite (~7 min)
#   PREPUSH_DRY=1 bash .githooks/prepush-gate.sh   # print what would run, run nothing
#
# Install once per clone (it is shared by every worktree):   git config core.hooksPath .githooks
#
# What it checks is decided by the files the pushed commits change against origin/staging.
# Every check runs CI's own command (.github/workflows/*):
#   always              one Alembic head, on the COMMIT's migrations (untracked parents don't count)
#   *.json changed      each file parses
#   frontend/ changed   tsc web (tsconfig.app.json) + tsc mobile + `npm test` (web, packages, mobile)
#   backend/ changed    pytest (SQLite): the changed test files, the tests that import a changed
#                       module, and every source-scanning guard (ratchets, heads, registries…);
#                       --full, or a change to models/migrations, runs the whole suite
#   .cortex/ .specflow/ `cortex validate` names none of the changed files
# Markdown files never trigger the frontend/backend checks. Missing node_modules or backend/.venv
# is reported as such, not as a compiler error.
# Not covered locally (CI only): Postgres + `flask db check`, the Android/Maestro lane.
#
# A pushed ref that is not the checked-out commit gets the commit-tree checks only (heads, JSON);
# the hook says so. Untracked files are warned about: they are in the tested tree, not the push.
# Escape hatch: a line `[skip-prepush: <reason>]` in one of the pushed commits' messages. The hook
# honours it and prints it; the reason is then in the history for review. Never --no-verify.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
BASE_REF="${PREPUSH_BASE:-origin/staging}"
SHA="${PREPUSH_SHA:-$(git rev-parse HEAD)}"
FULL=0
[ "${1:-}" = "--full" ] && FULL=1

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
FAILED=()
step() { # name, command...
  local name=$1; shift
  if [ -n "${PREPUSH_DRY:-}" ]; then printf '▷ %s: %s\n' "$name" "$*"; return 0; fi
  local t0=$SECONDS
  printf '▶ %s … ' "$name"
  local log; log="$(mktemp)"
  if "$@" >"$log" 2>&1; then
    green "ok ($((SECONDS - t0))s)"
  else
    red "FAILED ($((SECONDS - t0))s)"
    tail -25 "$log" | sed 's/^/    /'
    FAILED+=("$name")
  fi
  rm -f "$log"
}

git fetch -q origin staging 2>/dev/null || echo "(could not fetch origin; using the local $BASE_REF)"
MB="$(git merge-base "$SHA" "$BASE_REF")" || { red "no merge base with $BASE_REF"; exit 2; }
CHANGED="$(git diff --name-only "$MB" "$SHA")"
echo "levapp pre-push gate: $(git rev-parse --short "$SHA") vs $BASE_REF ($(printf '%s\n' "$CHANGED" | grep -c . ) files changed)"

TREE_ONLY="${PREPUSH_TREE_ONLY:-}"
if [ -z "$TREE_ONLY" ] && [ "$SHA" = "$(git rev-parse HEAD)" ]; then
  [ -n "$(git status --porcelain --untracked-files=no)" ] && \
    echo "(note: uncommitted changes in the working tree are included in the test runs below)"
  UNTRACKED="$(git status --porcelain --untracked-files=normal | grep -c '^??' || true)"
  [ "${UNTRACKED:-0}" -gt 0 ] && echo "(warning: $UNTRACKED untracked path(s) are in the tree the tests run on and will not be pushed — e.g. a parent migration placed for local runs: git status --short | grep '^??')"
fi

# Markdown (CLAUDE.md, specs, notes) never triggers a code check; .cortex/.specflow have their own.
CODE_CHANGED="$(printf '%s\n' "$CHANGED" | grep -vE '\.md$' || true)"
changed() { printf '%s\n' "$CODE_CHANGED" | grep -qE "$1"; }
changed_any() { printf '%s\n' "$CHANGED" | grep -qE "$1"; }
PY="$ROOT/backend/.venv/bin/python"

# 1. One Alembic head — on the commit's migrations, so a parent placed untracked for local runs
#    cannot hide a stacked branch's missing parent (CI: migration-heads.yaml).
heads_check() {
  local tmp; tmp="$(mktemp -d)"
  git archive "$SHA" backend/migrations/versions backend/scripts/check_alembic_heads.py | tar -x -C "$tmp"
  python3 "$tmp/backend/scripts/check_alembic_heads.py" "$tmp/backend/migrations/versions"
  local rc=$?; rm -rf "$tmp"
  if [ $rc -ne 0 ]; then
    echo "A stacked migration whose parent is not on staging yet fails here and in CI. Don't open"
    echo "or push the PR until the parent lands (or name '[skip-prepush: stacked on #NNN]')."
  fi
  return $rc
}
step "one Alembic head (commit tree)" heads_check

# 2. JSON parses.
JSONS="$(printf '%s\n' "$CHANGED" | grep -E '\.json$' || true)"
if [ -n "$JSONS" ]; then
  json_check() { local f rc=0; for f in $JSONS; do git show "$SHA:$f" >/dev/null 2>&1 || continue
    git show "$SHA:$f" | python3 -m json.tool >/dev/null || { echo "invalid JSON: $f"; rc=1; }; done; return $rc; }
  step "JSON parses" json_check
fi

# 3. Frontend — CI's exact commands (checks-frontend.yaml).
if [ -n "$TREE_ONLY" ]; then
  : # working-tree tiers skipped for a ref that is not checked out (the hook said so)
elif changed '^frontend/' && [ ! -d frontend/node_modules ]; then
  red "frontend/ changed but frontend/node_modules is missing: run 'npm ci' in frontend/ (Node 22) first."
  FAILED+=("frontend dependencies")
elif changed '^frontend/'; then
  node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }
  if [ "$(node_major || echo 0)" -lt 22 ] 2>/dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null && nvm use 22 >/dev/null 2>&1
  fi
  if [ "$(node_major || echo 0)" -lt 22 ] 2>/dev/null; then
    red "frontend/ changed but Node $(node -v 2>/dev/null || echo '(none)') is active; the frontend checks need Node 22 (nvm install 22)."
    FAILED+=("Node 22")
  else
    step "typecheck web"    bash -c 'cd frontend && npx tsc --noEmit -p apps/web/tsconfig.app.json'
    step "typecheck mobile" bash -c 'cd frontend && npx tsc --noEmit -p apps/mobile/tsconfig.json'
    step "unit tests (npm test: web, packages, mobile)" bash -c 'cd frontend && npm test --silent'
  fi
fi

# 4. Backend — pytest on SQLite (backend-tests.yaml runs the whole suite on both databases).
BACKEND_TOUCH='^backend/|^frontend/apps/web/e2e/scripts/|^frontend/apps/mobile/src/lib/push-routing'
if [ -n "$TREE_ONLY" ]; then
  :
elif { changed "$BACKEND_TOUCH" || [ $FULL -eq 1 ]; } && [ ! -x "$PY" ]; then
  red "backend changed but backend/.venv is missing: create it (or symlink the main checkout's) first."
  FAILED+=("backend dependencies")
elif changed "$BACKEND_TOUCH" || [ $FULL -eq 1 ]; then
  T=backend/padel_app/tests
  if [ $FULL -eq 1 ] || changed '^backend/padel_app/(models/|model\.py|sql_db\.py|__init__\.py)|^backend/migrations/'; then
    SELECT="padel_app/tests ../frontend/apps/web/e2e/scripts"
    echo "(full backend suite: $([ $FULL -eq 1 ] && echo --full || echo models or migrations changed))"
  else
    # a) guards: tests that scan the source tree rather than exercise one feature
    GUARDS="$(grep -lE 'read_text\(|rglob\(|os\.walk\(|ast\.parse\(|check_alembic|LEGACY_MAX|git ls-files' $T/test_*.py 2>/dev/null)"
    # b) changed test files
    CT="$(printf '%s\n' "$CHANGED" | grep -E '^backend/padel_app/tests/test_.*\.py$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)"
    # c) tests that import a changed module
    IMP=""
    for f in $(printf '%s\n' "$CHANGED" | grep -E '^backend/padel_app/.*\.py$' | grep -v '/tests/'); do
      mod="$(echo "${f#backend/}" | sed -e 's/\.py$//' -e 's#/#.#g' -e 's/\.__init__$//')"
      leaf="${mod##*.}"; parent="${mod%.*}"
      IMP="$IMP $(grep -lE "$mod\b|from $parent import [^#]*\b$leaf\b" $T/test_*.py 2>/dev/null)"
    done
    SEED=""; changed '^frontend/apps/web/e2e/scripts/' && SEED="../frontend/apps/web/e2e/scripts"
    SELECT="$(printf '%s\n' $GUARDS $CT $IMP | sort -u | sed 's#^backend/##' | tr '\n' ' ') $SEED"
    echo "(backend selection: $(printf '%s\n' $SELECT | grep -c .) test paths — guards + changed + importers)"
  fi
  step "pytest (sqlite)" bash -c "cd backend && PYTHONPATH=\$PWD '$PY' -m pytest $SELECT -q -p no:warnings -p no:cacheprovider"
fi

# 5. The knowledge layer names none of the changed files.
if [ -z "$TREE_ONLY" ] && changed_any '^\.cortex/|^\.specflow/' && command -v cortex >/dev/null; then
  cortex_check() { local out; out="$(cortex validate 2>&1)"; local hit=0 f
    for f in $(printf '%s\n' "$CHANGED" | grep -E '^\.(cortex|specflow)/'); do
      if printf '%s\n' "$out" | grep -A3 '\[ERROR\]' | grep -qF "$f"; then echo "cortex validate names $f"; hit=1; fi
    done
    [ $hit -eq 0 ] || printf '%s\n' "$out" | grep -A3 '\[ERROR\]' | head -30
    return $hit; }
  step "cortex validate (changed files)" cortex_check
fi

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  green "pre-push gate: all checks passed ($SECONDS s)"
  exit 0
fi
red "pre-push gate: ${#FAILED[@]} check(s) failed: ${FAILED[*]}"
echo "Fix them, or — only for a known, named reason — add '[skip-prepush: <reason>]' to a pushed commit's message."
exit 1
