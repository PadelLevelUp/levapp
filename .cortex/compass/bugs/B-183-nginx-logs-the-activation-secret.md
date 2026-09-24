---
id: B-183
title: "nginx logged the activation link's secret (?t=, ?token=) and its Referer"
type: incomplete-rule
severity: high
status: resolved
affects:
  - auth.activate
  - infra/nginx/
  - frontend/apps/web/nginx.conf
proposed_fix: "auth.activate gains rule 12. The log map also redacts t=, a second map cuts every Referer's query, /register/ and /api/app/register/ log errors only at crit, and /register/ answers with Referrer-Policy: no-referrer. Host and web nginx both. check-log-redaction.sh gains the probes."
opened: 2026-09-24T21:24:43Z
resolved: 2026-09-24T22:11:20Z
---

# B-183: nginx logged the activation secret

**Source:** Session-C's review of #425 (B-182), comment 5822491633, 2026-09-24. Folded into PAD-435 on the coordinator's instruction, so the host config is applied once.

**What happens:** the activation link is `/register/<id>?t=<secret>`, and the form's lookup is `GET /api/app/register/user/<id>?token=<secret>` (`auth.activate` rules 2, 4 and 8). The secret opens a coach-created account for activation, which means choosing its username and password. With B-182's first fix in place:
- the access log's map knew only `token` and `access_token`, so `?t=` was logged in the clear;
- the format logged `$http_referer` unchanged, and the page's own requests send `Referer: …/register/<id>?t=<secret>` (no `Referrer-Policy`; same-origin requests send the full URL);
- on an upstream error, nginx's error log printed the request line of `/register/…?t=` and `/api/app/register/user/…?token=`, plus the Referer of any request from that page.

**What should happen:** no nginx log holds the secret.

**Root cause:** Type 2, an incomplete rule, the same class as B-182. `auth.activate` puts the secret in URLs (the link has to carry it), but no rule covered the proxies' logs, and B-182's rule 4a named only the SSE token.

**Evidence (Phase 1, 2026-09-24):** C's three probes, added to `infra/nginx/check-log-redaction.sh`, run against #425's first head `0dc8641d1`:
- host: 15 secret-bearing requests; the canary was in access.log 6 times and error.log 6 times, and only 10 were logged redacted; no `Referrer-Policy` on any vhost's `/register/7`;
- web: access 2, error 1, 2 of 3 redacted, no `Referrer-Policy`.
A forged Referer on an upstream error still reaches error.log, since nginx prints the Referer there and no format applies (seen as `referrer: "…/register/7?t=…"`). Hence the `Referrer-Policy`, so that browsers never send it.

### Change Plan

**Spec:** `.specflow/specs/auth/activate.spec.md`. Add rule 12 and the criterion "No nginx log holds the activation secret (B-183)".

**Code (host `infra/nginx/` and web `frontend/apps/web/nginx.conf`):**
1. The URI map matches `(t|token|access_token)=`.
2. A second map, `$levapp_log_referer`, drops every Referer's query; the `redacted` format logs it. An empty Referer still logs as `-`.
3. `location /register/` and `location /api/app/register/`, copies of `/` and `/api/` with `error_log … crit`. The host `/register/` hides the upstream's `Referrer-Policy` and adds `no-referrer`. The web image serves the SPA shell from its own `/register/` location (`rewrite … break`, so the header survives) with the same header.

**Residual (accepted):** a non-browser client that ignores the policy and forges a Referer during an upstream outage can still put a secret in error.log. The check tolerates exactly that one forged line.

### Resolution

- Spec changes: `auth.activate` rule 12, plus its criterion.
- Tests: `infra/nginx/check-log-redaction.sh`, three probes plus the header check (CI `nginx-log-redaction.yaml`).
- Code: `infra/nginx/conf.d/levapp-log-redaction.conf`, the three vhosts, `frontend/apps/web/nginx.conf`.
- Merged: #425 (PAD-435) into staging, `d82a2c585`.

**Applied on the VM (coordinator, 2026-09-24 22:11 UTC):** the 4 files from #425 were installed (`conf.d/levapp-log-redaction.conf`, `sites-available/{levapp,levapp-staging,padellevelup}`), with a backup of the previous config kept on the VM. `nginx -t` passed and nginx was reloaded. levapp.app and staging both answer 200.
- Live probe: `/api/app/events?token=<probe>` and `/register/1?t=<probe>` were logged as `?[redacted]`, with 0 hits for either probe in access.log or error.log.
- Scrub: every `access.log*` and `error.log*`, `.gz` rotations included, went from 700+ leaked `token=` / `t=` values to 0. The current log files were rewritten in place (inodes kept).
- No JWT secret rotation (D141): tokens that leaked before the scrub stay valid until they expire.
