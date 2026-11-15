---
about: "`original_lesson_occurence_date` column is misspelled"
permanence: changing
verified: "2026-04-14 (observed)"
origin:
  - migrated:compass/bugs/B-005-occurence-typo-column.md@ef7a5f3
need:
  - backend/padel_app/models/lesson_instances.py
aliases:
  - B-005
  - B-005-occurence-typo-column
status: open
---

# B-005 — `original_lesson_occurence_date` column is misspelled

The column is `original_lesson_occurence_date` (sic); the spec and prose say occurrence. Fixing it needs a migration; functional impact is nil.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

<!-- 3.x fields of compass/bugs/B-005-occurence-typo-column.md, carried verbatim by cortex migrate -->
```yaml
type: layer-drift
severity: low
status: open
affects:
  - classes.instances
  - backend/padel_app/models/lesson_instances.py
proposed_fix: "Rename in a migration when a related migration is already scheduled; not worth its own deploy."
```
