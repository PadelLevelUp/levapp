---
id: B-007
title: "Error responses use inconsistent envelopes"
type: incomplete-rule
severity: low
status: open
affects:
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Standardise on one envelope for new handlers; migrate old ones opportunistically."
opened: 2026-04-14T00:00:00Z
---

# B-007 — Error responses use inconsistent envelopes

Some handlers return `{error: …}`, others `{msg: …}`; clients special-case both.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
