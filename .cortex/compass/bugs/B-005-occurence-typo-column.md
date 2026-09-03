---
id: B-005
title: "`original_lesson_occurence_date` column is misspelled"
type: layer-drift
severity: low
status: open
affects:
  - classes.instances
  - backend/padel_app/models/lesson_instances.py
proposed_fix: "Rename in a migration when a related migration is already scheduled; not worth its own deploy."
opened: 2026-04-14T00:00:00Z
---

# B-005 — `original_lesson_occurence_date` column is misspelled

The column is `original_lesson_occurence_date` (sic); the spec and prose say occurrence. Fixing it needs a migration; functional impact is nil.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
