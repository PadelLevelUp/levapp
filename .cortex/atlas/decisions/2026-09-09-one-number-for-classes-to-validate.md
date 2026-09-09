---
id: 2026-09-09-one-number-for-classes-to-validate
title: "One number for \"classes to validate\": classes, per Presences-tab week, one helper"
date: 2026-09-09
status: accepted
sources:
  - PAD-190
  - PAD-201
compass_rules: []
related_specs:
  - .specflow/specs/dashboard/blocks.spec.md
  - .specflow/specs/attendance/validation.spec.md
---

# One number for "classes to validate"

**Context.** PAD-190 recorded that the coach dashboard and the Presences tab disagreed on how
much was left to validate — different unit (presence rows vs classes) and different scope
(rolling last 7 days vs the Monday–Sunday week being browsed). PAD-201 reported the dashboard
card as "fake" and its click as an error. Nobody had decided what a coach should see.

**Decision.**

- **Unit: classes.** A coach validates a class, not a presence row; the tab, the dialog and the
  toast all speak in classes already.
- **Scope: a Presences-tab week (Monday–Sunday, UTC, `attendance.validation` rule 15).** The
  dashboard shows the **current** week; when the current week has nothing pending it shows the
  **previous** week instead, because on a Monday morning "nothing to validate" would hide the
  weekend's backlog — the exact moment the card matters. The card says which week it is
  counting and its link opens the tab **on that week** (`/presences?week=-1`), so the number a
  coach clicks is the number they land on.
- **One helper.** `count_pending_validation` derives the count from the same query that lists
  the tab's pending classes, and is exposed as one endpoint
  (`GET /api/app/class_instances/pending_validation/count`) that the tab trigger reads on both
  shells. The dashboard block calls the same function server-side. The two surfaces cannot
  disagree because there is nothing to disagree with.

**Rejected.** All-time scope on both (the number never reaches zero, and `coach_home.py` already
argued against it); rolling 7 days on both (the tab is week-paged, so a rolling window can
never match a page); presences as the unit (the tab's dialog is organised by class).
