---
id: B-287
title: "E2E: pad282-cancel-requested-class and class-evaluations assumed a class accepted or created today stays virtual; PAD-489 materialises it"
type: test-defect
severity: high
status: resolved
affects:
  - frontend/apps/web/e2e/class-requests/pad282-cancel-requested-class.spec.ts
  - frontend/apps/web/e2e/evaluation-tools/class-evaluations.spec.ts
  - .specflow/specs/attendance/confirm.spec.md
proposed_fix: "pad282 books 4-11 days out (outside the reminder window); class-evaluations compares classRef with the occurrence the calendar shows. Test and spec wording only."
opened: 2026-10-03T13:23:38Z
resolved: 2026-10-03T13:34:57Z
---

# B-287: two specs assumed "today/tomorrow" stays virtual

**Source:** the release gate on staging 71981fb80 (2026-10-03), red in the shard and alone.

**What happened:**
- `pad282-cancel-requested-class.spec.ts:80`: `expect(virtual!.model).toBe("Lesson")` got
  `"LessonInstance"`. The class the coach accepted from the student's request for TOMORROW is
  materialised at acceptance.
- `class-evaluations.spec.ts:125` (US-376a): the panel's `classRef` did not match
  `{model: cls.model, id: cls.id}` from `add_class`. A class added TODAY at 20:30 is materialised at
  creation, so the panel names the `LessonInstance`.

**Root cause:** PAD-489 (#535, `notifications.reminders` rule 22, the owner's decision of
2026-10-02): a class created after its first-reminder time, including a student's own request
accepted late, is materialised at creation with its students counted as coming. That behaviour is
intended. The specs' "still virtual" premise is what changed. #535 already moved the backend
PAD-282 tests five days out (5902af516); the two E2E specs were not in its run.

**Evidence (2x2, isolated stack levelup_test_gate11c, one worker, freshly seeded each run):**

| | staging 71981fb80 (PAD-489 in) | #535 reverted locally (`git revert -m 1 740f06091`) |
|---|---|---|
| specs as on staging | red: both fail (13:23Z) | green: 6 passed (13:25Z) |
| specs fixed (18801fabd) | green: pad282 + class-evaluations + profile-completeness 7 passed (13:28Z); class-evaluations 5 passed (13:31Z) | green: class-evaluations 5 passed (13:32Z); pad282 passed (13:29Z) |

The first fix of class-evaluations read the calendar AFTER the rating, and it failed in the
"reverted" cell. The rating itself materialises a virtual occurrence. The calendar is now read
before the panel opens, and both columns are green.

**Fix:** test and spec wording only, no product code.
- pad282 books the first free slot 4 to 11 days out.
- class-evaluations compares `classRef` with the occurrence the calendar shows.
- `attendance.confirm`'s two PAD-282 criteria say "still virtual", with the reason.

**Also run alone for the record (13:33Z, same stack):**
- `messaging/nav-unread-badge.spec.ts`: 1 passed (16.5 s), B-286, open.
- `settings/season-definition.spec.ts`: 3 passed (32.8 s). Its `:98` case failed in the gate's
  shard 4 at `pick` (`:39`). That makes it load-sensitive; no new id.

### Resolution
- Tests: the two specs above, plus the backend test's comment.
- Spec: `attendance.confirm` (two criteria).
- Code: none.
