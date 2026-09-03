---
id: B-004
title: "SSE events are broadcast to every connected client"
type: incomplete-rule
severity: high
status: open
affects:
  - messaging.sse-realtime
  - backend/padel_app/realtime.py
proposed_fix: "Filter at publish time by recipient user id; the spec rule should state that a client only receives its own events."
opened: 2026-04-14T00:00:00Z
---

# B-004 — SSE events are broadcast to every connected client

`publish()` fans every event out to all queues; the frontend filters. Any client can observe events meant for another user. Verify whether per-user filtering was added since April 2026 before acting.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
