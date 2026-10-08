---
id: B-382
title: "The auth rate limits keyed on the client-sent X-Forwarded-For, so a fresh made-up entry per request was never limited"
type: wrong-rule
severity: high
status: open
affects:
  - auth.login
  - auth.register
  - auth.password-recovery
  - auth.email-verification
  - admin.foundation
  - backend/padel_app/utils/rate_limit.py
  - infra/nginx/conf.d/levapp-cloudflare-real-ip.conf
proposed_fix: "nginx resolves $remote_addr from CF-Connecting-IP for Cloudflare's ranges only; client_ip() reads the nginx-set X-Real-IP alone (else the socket peer) and never X-Forwarded-For."
opened: 2026-10-07T23:48:31Z
---

# B-382: the auth rate limits trusted the client's X-Forwarded-For

**Source:** the coordinator's review of #581 (2026-10-08), confirmed by a probe: a fresh
`X-Forwarded-For` per request was never limited. Ticket PAD-554. Live in production.

**What the rule assumed:** `client_ip()` (PAD-228) took the first `X-Forwarded-For` entry,
"Cloud Run's load balancer", with the docstring "a spoofed header only moves the caller into a
bucket of their own choosing". That is the bypass: choosing a new bucket per request IS escaping
the limit. The app has run behind the host nginx (`$proxy_add_x_forwarded_for`, which keeps the
client's value) since the move to the VM, never behind a load balancer that overwrites it.

**Effect:** the login, register, password-recovery and email-verification throttles, and the staff
console's sign-in throttle (#581), could be bypassed by any client.

**Reproduced:** `test_auth_rate_limit.py::test_a_spoofed_forwarded_for_does_not_change_the_key`
(red on the old `client_ip`: the second request with a new XFF answered 401, not 429).

**Root-cause class:** a rule written for an earlier deployment (a trusted load balancer) that
outlived it. Wrong rule.

**Fix (PAD-554):** `infra/nginx/conf.d/levapp-cloudflare-real-ip.conf` (`set_real_ip_from`
Cloudflare's published ranges, `real_ip_header CF-Connecting-IP`), hand-applied on the VM
BEFORE the backend change deploys; `client_ip()` reads only `X-Real-IP`, which every vhost already
sets from `$remote_addr`, falling back to the socket peer. Ledger id within Session E's range,
numbering unconfirmed.
