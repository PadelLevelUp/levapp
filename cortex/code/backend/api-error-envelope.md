---
about: Error responses use inconsistent envelopes
permanence: changing
verified: "2026-04-14 (observed)"
origin:
  - migrated:compass/bugs/B-007-api-error-envelope.md@ef7a5f3
need:
  - backend/padel_app/modules/frontend_api.py
aliases:
  - B-007
  - B-007-api-error-envelope
status: open
---

# B-007 — Error responses use inconsistent envelopes

Some handlers return `{error: …}`, others `{msg: …}`; clients special-case both.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

<!-- 3.x fields of compass/bugs/B-007-api-error-envelope.md, carried verbatim by cortex migrate -->
```yaml
type: incomplete-rule
severity: low
status: open
affects:
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Standardise on one envelope for new handlers; migrate old ones opportunistically."
```
