---
about: No account lockout after repeated failures
permanence: changing
verified: "2026-04-14 (observed)"
origin:
  - migrated:compass/bugs/B-002-login-no-lockout.md@ef7a5f3
need:
  - backend/padel_app/modules/api_auth.py
aliases:
  - B-002
  - B-002-login-no-lockout
status: open
---

# B-002 — No account lockout after repeated failures

Failed logins have no consequence. Companion to B-001; a temporary lockout after repeated failures is the expected behaviour and is unspecified.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

<!-- 3.x fields of compass/bugs/B-002-login-no-lockout.md, carried verbatim by cortex migrate -->
```yaml
type: missing-criterion
severity: medium
status: open
affects:
  - auth.login
  - backend/padel_app/modules/api_auth.py
proposed_fix: "Specify lockout policy in `auth.login` alongside B-001."
```
