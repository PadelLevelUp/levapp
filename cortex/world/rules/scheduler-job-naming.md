---
about: Scheduler job ids follow the fixed naming scheme
permanence: changing
verified: "2026-10-22 (told)"
origin:
  - migrated:compass/rules/R-010-scheduler-job-naming.md@ef7a5f3
aliases:
  - R-010
  - R-010-scheduler-job-naming
applies_when: "When the agent does work this rule governs: scheduler job ids follow the fixed naming scheme"
scope:
  - action
match: { commands: [], paths: [backend/padel_app/scheduler.py, "backend/padel_app/services/**/*.py"] }
source: user@2026-10-22
---

# R-010 — Scheduler job ids follow the fixed naming scheme

`reminder_lesson_{lesson_id}_{YYYY-MM-DD}`, `invite_start_lesson_{lesson_id}_{YYYY-MM-DD}`, `invite_start_{instance_id}`, `process_batches`, `extend_schedule_window`, `prune_delivery_incidents` (PAD-534), `retention_sweep` (PAD-638), and `<daily id>_catchup` (B-667: one late run of a daily job a boot found missed). The extend/self-heal logic finds jobs by these names. The two lesson-level families (PAD-540) are one job per lesson and date each, and both are removed when the occurrence is materialised, so an occurrence never has a lesson-level job and its instance job armed at once.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-010-scheduler-job-naming.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
