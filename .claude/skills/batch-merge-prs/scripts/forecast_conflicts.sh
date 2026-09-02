#!/usr/bin/env bash
# Forecast which batched branches will conflict with each other — without creating
# a single commit, ref, or checkout.
#
# Why this exists: GitHub's `mergeable` / `mergeStateStatus: CLEAN` is computed
# pairwise against `main`, never PR-against-PR. In a batch every PR can report CLEAN
# and still collide with a sibling. `git merge-tree --write-tree` does a real 3-way
# merge in memory and tells you the truth.
#
# Two passes, because they answer different questions:
#   pairwise   — which two tickets fight, and over which file (tells you what to
#                read before you start, and which pair may need a human decision)
#   cumulative — replays the actual integration order onto a temp index, catching
#                conflicts that only appear once 3+ PRs have piled into one file.
#                Pairwise alone under-reports these.
#
# Usage:
#   forecast_conflicts.sh <repo-dir> <base-ref> <branch>...
# Example:
#   forecast_conflicts.sh ~/levapp-batch-wt origin/staging \
#       origin/feature/lvl-pad-100 origin/feature/pad-92-authz-frontend-api

set -uo pipefail

REPO="${1:?usage: forecast_conflicts.sh <repo-dir> <base-ref> <branch>...}"
BASE="${2:?usage: forecast_conflicts.sh <repo-dir> <base-ref> <branch>...}"
shift 2
BRANCHES=("$@")
[ "${#BRANCHES[@]}" -ge 1 ] || { echo "no branches given"; exit 2; }

cd "$REPO" || exit 2

conflicted_files() {
  # merge-tree exits non-zero on conflict and prints the tree oid on line 1,
  # then conflicted paths. Emit just the paths.
  local a="$1" b="$2"
  git merge-tree --write-tree --name-only --merge-base="$(git merge-base "$a" "$b")" "$a" "$b" 2>/dev/null \
    | tail -n +2 | sed '/^$/d' | sort -u
}

echo "=== Pairwise conflict forecast (${#BRANCHES[@]} branches, base $BASE) ==="
pair_hits=0
for ((i = 0; i < ${#BRANCHES[@]}; i++)); do
  for ((j = i + 1; j < ${#BRANCHES[@]}; j++)); do
    files=$(conflicted_files "${BRANCHES[i]}" "${BRANCHES[j]}")
    if [ -n "$files" ]; then
      pair_hits=$((pair_hits + 1))
      echo "CONFLICT  ${BRANCHES[i]}  ×  ${BRANCHES[j]}"
      echo "$files" | sed 's/^/            /'
    fi
  done
done
[ "$pair_hits" -eq 0 ] && echo "(none)"

echo
echo "=== Cumulative forecast (integration order as given) ==="
# Build up a merged tree commit-by-commit in a temp index so we see what the Nth
# merge actually lands on, not what it would land on against a pristine base.
acc="$(git rev-parse "$BASE")"
cum_hits=0
for br in "${BRANCHES[@]}"; do
  mb="$(git merge-base "$acc" "$br" 2>/dev/null)"
  out="$(git merge-tree --write-tree --name-only --merge-base="$mb" "$acc" "$br" 2>/dev/null)"
  rc=$?
  tree="$(echo "$out" | head -1)"
  if [ $rc -ne 0 ]; then
    cum_hits=$((cum_hits + 1))
    echo "CONFLICT  merging $br into the accumulated batch:"
    echo "$out" | tail -n +2 | sed '/^$/d' | sed 's/^/            /'
    echo "            → resolve this one by hand; forecast beyond here is unreliable"
    break
  fi
  # Wrap the merged tree in a throwaway commit so the next iteration has a real
  # commit-ish to merge against. Unreferenced; garbage-collected on its own.
  acc="$(git commit-tree "$tree" -p "$acc" -p "$br" -m "forecast: $br" 2>/dev/null)"
  [ -n "$acc" ] || { echo "could not build forecast commit for $br"; exit 2; }
  echo "clean     $br"
done
[ "$cum_hits" -eq 0 ] && echo "(all merges clean in this order)"

echo
echo "Nothing was committed to a branch and no refs were created or moved."
echo "Files appearing in the PAIRWISE list are where two tickets disagree — read those"
echo "diffs before integrating, and check whether the disagreement is mechanical"
echo "(combine both sides) or semantic (needs a human decision)."
