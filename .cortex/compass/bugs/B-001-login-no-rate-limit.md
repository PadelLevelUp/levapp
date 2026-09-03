---
id: B-001
title: "No rate limiting on login attempts"
type: missing-criterion
severity: high
status: open
affects:
  - auth.login
  - backend/padel_app/modules/api_auth.py
proposed_fix: "Add an acceptance criterion to `auth.login` for throttling, then implement it in the login handler."
opened: 2026-04-14T00:00:00Z
---

# B-001 — No rate limiting on login attempts

Unlimited login attempts are accepted. Expected: throttle after N failures per window (e.g. 5/min) — the `auth.login` leaf carries no criterion for it.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
