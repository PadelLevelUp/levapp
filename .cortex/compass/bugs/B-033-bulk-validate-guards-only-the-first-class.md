---
id: B-033
title: "Presences bulk validate leaves classes 2..N tappable mid-run"
type: incomplete-rule
severity: low
status: resolved
affects:
  - attendance.validation
  - frontend/apps/web/src/pages/PresencesPage.tsx
  - frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx
related_specs:
  - .specflow/specs/attendance/validation.spec.md
proposed_fix: "Track the set of in-flight class ids and disable on membership."
opened: 2026-09-09T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-033 — Presences bulk validate leaves classes 2..N tappable mid-run

**Source:** PAD-191 (PAD-140 review, found by reading).

**What happens:** `PresencesPage.handleValidate` set `busyClassId` to the FIRST class of the
run; the per-class Validate buttons disable on `busyClassId === klass.lessonInstanceId`, so
classes 2..N stayed enabled while the loop was still POSTing and could be submitted twice.

**Impact:** low — `confirm_presences` is effectively idempotent, so a double submit is a wasted
request and a flicker, not corruption.

**Root cause:** Type 2 — incomplete rule. `attendance.validation` rule 7 describes what a bulk
run validates but nothing said every queued class is guarded while it runs; the web shell
guarded one. iOS was never affected: its sheet passes one `busy` flag to every card.

**Fix:** rule 7a; web tracks `busyClassIds: number[]` and disables on membership. Covered by a
vitest render of `ValidateClassesDialog` and a Playwright bulk run with a delayed confirm route.
