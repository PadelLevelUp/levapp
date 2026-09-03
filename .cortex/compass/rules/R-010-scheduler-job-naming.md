---
id: R-010
title: "Scheduler job ids follow the fixed naming scheme"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/scheduler.py"
  - "backend/padel_app/services/**/*.py"
confidence: EXTRACTED
status: active
---

# R-010 — Scheduler job ids follow the fixed naming scheme

`reminder_lesson_{lesson_id}_{YYYY-MM-DD}`, `invite_start_{instance_id}`, `process_batches`, `extend_schedule_window`. The extend/self-heal logic finds jobs by these names.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
