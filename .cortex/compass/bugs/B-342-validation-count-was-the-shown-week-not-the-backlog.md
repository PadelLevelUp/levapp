---
id: B-342
title: "Presences: 'X aulas por validar', the badge and the dashboard card counted one week, so classes left over from earlier weeks read as nothing to validate"
type: wrong-rule
severity: high
status: resolved
resolved: 2026-10-07T20:30:00Z
affects:
  - attendance.validation
  - dashboard.blocks
  - backend/padel_app/services/presence_overview_service.py
  - backend/padel_app/helpers/dashboard/coach_home.py
proposed_fix: "Pending is the whole backlog: one query predicate (ended, not canceled, an unvalidated presence row), counted with no lower bound; the tab shows the total plus the shown week's count; the badge and the dashboard item show the total and deep-link to the most recent week with something pending."
opened: 2026-10-07T20:30:00Z
---

# B-342 — the validation count was the shown week, not the backlog (id unconfirmed, Session C range)

**Source:** PAD-539, reported by the founder via Discord, 2026-10-07: three classes to validate
last week and none this week read "0 aulas por validar" on the Presences tab until the coach
navigated to last week and came back.

**What the rule said:** `attendance.validation` rule 18 (PAD-190/201, B-045) made the tab's
trigger read the count endpoint "for the week it is showing"; rule 23 (PAD-443) made the badge
and the dashboard card the current week's count, else the previous week's, 0 when both were
clean. The code did exactly that (`count_pending_validation` over `week_bounds`,
`validation_badge` over `VALIDATION_WEEK_OFFSETS = (0, -1)`). The ticket is therefore not a bug
against the spec: the rule was wrong for what the surface is for — classes must not be
forgotten — and a window of any length recreates the forgetting one week later.

**Observed (read at staging `7db0e3f4a`):** `ValidateClassesDialog.tsx` and
`PresencesScreen.tsx` render `pendingCount` from `/pending_validation/count?from&to` for the
shown week; `PresencesBadge.tsx` and the iOS tab badge render `validation_badge`'s `count`.
Nothing anywhere counted older weeks.

**Decision (coordinator for the owner, 2026-10-07):** "unbounded + badge total". Pending = every
ended, non-canceled occurrence with an unvalidated presence row, no lower bound (an occurrence
without presence rows never counts, which bounds history naturally). The tab shows "X aulas por
validar · Y nesta semana"; the badge and the dashboard item show X and land on the most recent
week with something pending. Rules 18 and 23 and `dashboard.blocks` rule 3 amended; one query
predicate serves the listing and every count, and a test asserts the three surfaces agree.
