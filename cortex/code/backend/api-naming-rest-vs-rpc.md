---
about: Endpoint naming mixes REST and RPC styles
permanence: changing
verified: "2026-04-14 (observed)"
origin:
  - migrated:compass/bugs/B-006-api-naming-rest-vs-rpc.md@ef7a5f3
need:
  - backend/padel_app/modules/frontend_api.py
aliases:
  - B-006
  - B-006-api-naming-rest-vs-rpc
status: open
---

# B-006 — Endpoint naming mixes REST and RPC styles

`/exercises/{id}` beside `/add_class`, `/remove_class`. Cosmetic; zero functional impact.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

<!-- 3.x fields of compass/bugs/B-006-api-naming-rest-vs-rpc.md, carried verbatim by cortex migrate -->
```yaml
type: incomplete-rule
severity: low
status: open
affects:
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Pick a convention for new endpoints and record it as a compass rule; do not rename existing routes (the iOS binary pins them)."
```
