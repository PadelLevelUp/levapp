---
id: B-182
title: "The host nginx logged the SSE access token (?token=<JWT>) in access.log and error.log"
type: incomplete-rule
severity: high
status: triaged
affects:
  - auth.login
  - R-009
  - infra/nginx/
  - frontend/apps/web/nginx.conf
proposed_fix: "auth.login gains rule 4a (no proxy logs the SSE token). The host nginx is versioned under infra/nginx/: an http-level map and log_format redact any token= query, every server block logs with it, and the SSE location logs errors only at crit. The web image's nginx.conf does the same. infra/nginx/check-log-redaction.sh proves it in Docker, and CI runs it."
opened: 2026-09-24T21:10:28Z
---

# B-182: the host nginx logged the SSE access token

**Source:** Session-A's read of the prod nginx access log at 17:4x UTC on 2026-09-24. Taken over by Session-E for the coordinator (PAD-435, decision A + C).

**What happens:** `EventSource` cannot set headers, so the SSE endpoint takes the access token in the query string: `GET /api/app/events?token=<JWT>` (R-009, `auth.login` rule 4). The VM's host nginx logs with the http-level `access_log /var/log/nginx/access.log;`, the combined format, whose `$request` is the whole request line. No vhost overrides it. So every SSE connection wrote a live access token, valid for 30 days, to access.log. On an upstream error nginx also writes `request: "GET /api/app/events?token=…"` to error.log. The rotated logs are kept for 14+ days and are readable by adm-group users on the VM.

**What should happen:** no nginx log holds a token. The SSE request is still logged, with its query cut.

**Root cause:** Type 2, an incomplete rule. `auth.login` rule 4 and R-009 confine the query-string token to the SSE endpoint. PAD-269 made that change precisely because tokens were reaching access logs. But no rule covered the proxies' own logs, and the host vhosts were unversioned (they lived only in `/etc/nginx/sites-available/` on the VM), so no review or test could have seen it.

**Evidence (Phase 1, 2026-09-24):**
- The live config (the coordinator's read-only copy of `sites-enabled/*` and `nginx.conf`) has the http-level `access_log /var/log/nginx/access.log;` with no vhost-level `access_log`.
- Reproduced by running those exact files in `nginx:1.27` (Debian, `user www-data`, as on the VM) with stand-in certificates and one canary-token request per vhost and port. The canary was in access.log 5 times (3 vhosts on 443, 2 port-80 redirect blocks) and in error.log 3 times (each proxied request, upstream down).
- The web image's `nginx.conf` on staging (`nginx:1.27-alpine`) had the same leak: access.log once, error.log once. Prod traffic to `/api/` goes from the host nginx straight to the API container, so that one is a local/dev exposure.

### Change Plan

**Spec:** `.specflow/specs/auth/login.spec.md`. Add rule 4a (no proxy logs the SSE token) and the criterion "No nginx log holds the SSE token (B-182)".

**Code:**
1. Version the host files as `infra/nginx/{nginx.conf, sites-available/{levapp,levapp-staging,padellevelup}}`, byte-identical to live apart from the fix.
2. `infra/nginx/conf.d/levapp-log-redaction.conf`: a map from `$request_uri` to `$levapp_log_request_uri`, where any `token=` / `access_token=` query becomes `?[redacted]`, plus `log_format redacted` (combined, with that URI).
3. Every server block, on 443 and 80: `access_log /var/log/nginx/access.log redacted;`. The SSE location: `error_log /var/log/nginx/error.log crit;`.
4. The same in `frontend/apps/web/nginx.conf`, with its own `location /api/app/events`.
5. `infra/nginx/check-log-redaction.sh` plus `.github/workflows/nginx-log-redaction.yaml`.

**After merge (coordinator, on the VM):** copy the conf.d file and the three vhosts over, run `nginx -t`, reload, then scrub the token from the existing `access.log*` and `error.log*`.

**Trade-off:** SSE upstream errors at level `error` (for example, a connect refused while the API restarts) no longer reach error.log. Clients see the 502 and reconnect. The access log still records every SSE request and its status.

### Resolution

- Spec changes: `auth.login` rule 4a, plus criterion "No nginx log holds the SSE token (B-182)".
- Tests added: `infra/nginx/check-log-redaction.sh`, run in CI by `nginx-log-redaction.yaml`.
- Code changes: `infra/nginx/` (new), `frontend/apps/web/nginx.conf`.
