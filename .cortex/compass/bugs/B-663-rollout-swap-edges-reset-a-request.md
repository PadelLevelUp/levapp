---
id: B-663
title: "A rolling swap has two seconds-wide windows where docker-proxy accepts and then resets a request; nginx retries a GET, a POST would be a 502"
type: incomplete-rule
severity: medium
status: open
affects:
  - backend/scripts/rollout.sh
  - .specflow/specs/delivery/zero-downtime-deploy.spec.md
proposed_fix: "PAD-714: rollout.sh marks a port `down` in the upstream and reloads nginx around both edges (idle port until healthy, old port before `docker stop`); alternative for the boot edge only: Docker `userland-proxy: false`."
opened: 2026-10-21T20:55:00Z
---

# B-663: the swap's edges reset a request

**Source:** staging run 39672615429 (2026-10-21), the first rolling deploy after B-662's fix
(5100 -> 5102, next healthy 20:45:49Z, done 20:45:52Z, 0 5xx on the probe). The host nginx
error.log shows two `recv() failed (104: Connection reset by peer) while reading response header
from upstream`: 20:45:42 (new container booting) and 20:45:51 (old container stopping).
Observed by la-2110-SessionH.

**Mechanism (inferred, not reproduced with a POST):** Docker's userland proxy accepts on the
published loopback port as soon as a container starts, before gunicorn listens inside it, and
keeps accepting after gunicorn closes its listener during `docker stop`. It then cannot reach the
app and closes the connection. nginx sees a reset *after* sending the request, not a connect
`error`: the default `proxy_next_upstream` retries it only for an idempotent method. Both
observed requests were GETs and were retried; a POST in those seconds would most likely answer 502.

**Why the spec missed it:** rule 5 relied on "a refused connection is retried on the other port";
with docker-proxy in front, an unready port does not refuse, it accepts and resets. Rule 10
(PAD-691) said the boot gate exits "before any port is bound"; corrected to "before gunicorn
listens" with this caveat.

**Ruling (coordinator, 2026-10-21):** a host change for the architecture tree (PAD-714), not
tonight. A seconds-wide window for non-idempotent requests is strictly better than the full
stop-first outage every deploy had before B-662; the promotion PR carries it as known small print.
Rejected: `proxy_next_upstream ... non_idempotent` (in the stop window a POST may already have run).
