---
id: B-664
title: "rollout.sh stopped the old container 1–3 s after the new one was healthy, inside the nginx fail_timeout a boot-time failure had opened on the new port: no live upstream, 502 for every method"
type: incomplete-rule
severity: high
status: resolved
affects:
  - backend/scripts/rollout.sh
  - .github/workflows/deploy-staging.yaml
  - .github/workflows/deploy-prod.yaml
  - .specflow/specs/delivery/zero-downtime-deploy.spec.md
proposed_fix: "After healthy, keep the old container serving for the idle port's fail_timeout + 1 s (read from the upstream conf), then require one request through nginx to the vhost to answer below 500 before stopping it. PAD-714's drain remains the full remedy."
opened: 2026-10-21T23:30:00Z
---

# B-664: the old port stopped inside the new port's fail_timeout

**Source:** staging runs 39690638599 (23:06:45–47Z) and 39690944534 (23:12:09–10Z), the first two
rolling deploys after #753 (PAD-691). nginx's error.log shows "no live upstreams while connecting
to upstream" for about 2 s each time. Read by la-2110-SessionH.

**Mechanism:** a request nginx proxied to the new port while its container booted got "upstream
prematurely closed connection" (B-663's boot edge: docker-proxy accepts before gunicorn listens).
With `max_fails=1 fail_timeout=5s` that marks the new port down for 5 s. `rollout.sh` saw the new
port healthy (it probes the port directly, not through nginx) and stopped the old one 1.4–3 s
later, so both servers were down in nginx's view and every method got 502 until the 5 s ran out.
Prod's first rolling deploy took 11 s from healthy to done, past the window, which is why it was
clean. PAD-691's boot gate made the pre-listen window longer, so a boot-time request became more
likely.

**Why the spec missed it:** rule 4 treated "the new port answers 200 to a direct probe" as "nginx
will send to it". nginx's view of the port is its own and lags by up to fail_timeout.

**Fix (coordinator's ruling, 2026-10-21):** after healthy, the old container keeps serving for the
idle port's fail_timeout + 1 s, counted from "healthy" (the last moment a boot-time failure can
happen; counting from the first probe would miss a failure just before healthy). Then one request
through nginx (`--probe-host`, resolved to 127.0.0.1) must answer below 500, or the new container
is removed and the old keeps serving. That request may be answered by the old port, so it proves
the nginx path, not the new port; the wait is what closes the window. The PAD-714 drain (mark a
port `down` and reload) stays the full remedy.
