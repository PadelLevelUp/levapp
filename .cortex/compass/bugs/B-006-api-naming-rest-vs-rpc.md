---
id: B-006
title: "Endpoint naming mixes REST and RPC styles"
type: incomplete-rule
severity: low
status: open
affects:
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Pick a convention for new endpoints and record it as a compass rule; do not rename existing routes (the iOS binary pins them)."
opened: 2026-04-14T00:00:00Z
---

# B-006 — Endpoint naming mixes REST and RPC styles

`/exercises/{id}` beside `/add_class`, `/remove_class`. Cosmetic; zero functional impact.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
