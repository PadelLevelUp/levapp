---
id: B-002
title: "No account lockout after repeated failures"
type: missing-criterion
severity: medium
status: open
affects:
  - auth.login
  - backend/padel_app/modules/api_auth.py
proposed_fix: "Specify lockout policy in `auth.login` alongside B-001."
opened: 2026-04-14T00:00:00Z
---

# B-002 — No account lockout after repeated failures

Failed logins have no consequence. Companion to B-001; a temporary lockout after repeated failures is the expected behaviour and is unspecified.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
