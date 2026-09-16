#!/usr/bin/env bash
# Install the nightly backup cron entry, idempotently, and prove it is there.
#
# PAD-353 (B-090, compass R-028). The deploy used to do this inline:
#
#   (crontab -l 2>/dev/null | grep -v backup.sh; echo "0 3 * * * ...") | crontab -
#
# On a VM whose crontab held only the backup line, `grep -v` matched nothing and
# exited 1; under `set -e` that killed the subshell before the `echo`, so
# `crontab -` was handed an empty document and the schedule was WIPED. The step
# had also never checked its own work: it reported success for months without
# anything reading the crontab back.
#
# Configurable for tests; the deploy uses the defaults.
set -euo pipefail

BACKUP_SH="${BACKUP_SH:-$HOME/backup.sh}"
BACKUP_LOG="${BACKUP_LOG:-$HOME/backup.log}"
CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
LINE="$CRON_SCHEDULE $BACKUP_SH >> $BACKUP_LOG 2>&1"

# `crontab -l` exits 1 when the user has no crontab at all; that is a starting
# state, not a failure. Every filter below is guarded with `|| true` for the
# same reason grep killed the old one-liner: an empty match is normal here.
current="$(crontab -l 2>/dev/null || true)"
kept="$(printf '%s\n' "$current" | grep -v -e 'backup\.sh' -e '^[[:space:]]*$' || true)"

{
  if [ -n "$kept" ]; then printf '%s\n' "$kept"; fi
  printf '%s\n' "$LINE"
} | crontab -

# The point of the ticket: read it back. A scheduling step that cannot fail is
# not a check (the same defect class as B-080 itself).
after="$(crontab -l 2>/dev/null || true)"
count="$(printf '%s\n' "$after" | grep -c 'backup\.sh' || true)"
if [ "${count:-0}" -ne 1 ]; then
  echo "::error::nightly backup cron not installed: expected exactly one backup.sh line, found ${count:-0}" >&2
  printf 'crontab now:\n%s\n' "$after" >&2
  exit 1
fi

echo "nightly backup cron installed: $LINE"
