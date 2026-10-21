---
id: B-662
title: "rollout.sh never saw an enabled vhost: sites-enabled holds symlinks and `grep -r` skips them, so every deploy fell back to stop-first"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-21T20:30:00Z
affects:
  - backend/scripts/rollout.sh
  - .specflow/specs/delivery/zero-downtime-deploy.spec.md
proposed_fix: "Name the sites-enabled entries on the command line (a glob) instead of recursing: every grep follows a symlink given as an argument. Test the detector against a directory of symlinks."
opened: 2026-10-21T20:10:00Z
---

# B-662: rollout.sh never saw a symlinked vhost

**Source:** staging deploy 2026-10-21 19:14Z (run 39659659124), the first after the owner applied
the two-port nginx upstream on the host at 18:59Z (PAD-688). It logged "no enabled vhost in
/etc/nginx/sites-enabled proxies to levapp_api_staging yet: stop-first (rule 6)" and swapped
stop-first, although `sites-available/levapp-staging` proxies to the upstream and
`sites-enabled/levapp-staging` links to it. Found by la-1410-orchestrator.

**What happened:** rule 6's detector ran `grep -rqsE "proxy_pass … http://<upstream>" "$NGINX_SITES_DIR"`.
On a Debian host every entry in `sites-enabled` is a symlink into `sites-available`. GNU grep `-r`
follows a symlink only when it is named on the command line, never one met while recursing, so
the search found nothing and the rollout chose stop-first on every deploy: the 502 window rule 4
exists to remove, and tonight's prod deploy would have repeated it while appearing to prove the
rolling path.

**Evidence (read-only, 2026-10-21):** on the VM `grep -rl levapp_api_staging /etc/nginx/sites-enabled`
returns nothing and `grep -Rl` returns `levapp-staging` and `levapp-admin-staging` (orchestrator).
GNU grep 3.11 (`python:3.10-slim`): `-r` exit 1, `-R` exit 0 on a symlinked entry. BSD grep (macOS)
`-R` does not follow it either, which is why the fix globs instead of switching to `-R`.

**Why the tests missed it:** `test_pad588_rollout.py` wrote the vhost as a regular file in
`sites-enabled`; the host never has one. Rule 6 said "no enabled vhost proxies to it" without the
criterion that enabled vhosts are symlinks: an incomplete rule.

**Fix:** `grep -qsE … "$NGINX_SITES_DIR"/*` (rollout.sh). Test
`test_a_vhost_enabled_by_symlink_is_seen_and_the_deploy_rolls`: red on the `-r` line (stop-first),
green on the glob. The empty-directory case still means stop-first (no match, exit 2).
