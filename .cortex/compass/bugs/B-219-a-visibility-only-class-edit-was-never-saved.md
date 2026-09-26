---
id: B-219
title: "A class edit that changed only openSpotsVisible was never saved (PAD-429 moved the save into the auto-invites block)"
type: missing-criterion
severity: high
status: resolved
affects:
  - eligibility.open-spot-visibility
  - backend/padel_app/services/lesson_service.py
proposed_fix: "Each visibility block in edit_class_service saves on its own again (five sites)."
opened: 2026-09-26T13:32:14Z
resolved: 2026-09-26T13:32:14Z
---

# B-219: a visibility-only class edit was never saved

**Source:** the coordinator's compat audit of staging `4f6640634` (wave 8). Taken by Session-B.

**What happens:** PAD-429 (`b7bab9a34`) moved the `.save()` that used to sit under `if visibility_touched:` into its new `if auto_invites_touched:` block of `edit_class_service`. Web and iOS send only the fields that changed (`edit-class-diff.ts`). So an edit that changed only `openSpotsVisible` set the attribute and returned without committing, and the change was lost on all five edit paths:
- an instance's single occurrence;
- an instance's this-and-following;
- a lesson's single occurrence (existing instance, or created now);
- a lesson's this-and-following.

**Root cause (observed):** `test_b219_visibility_only_edit_is_saved.py` reads back from a fresh session, because an uncommitted attribute is still visible through the identity map. It was red on all five paths (`None`, expected `False`). The controls (`autoInvites` alone, `eligibilityRules` alone) were green: each has its own save. Nothing else in the backend writes these fields without saving (`update_notification_config` and the notifications toggle save unconditionally). Type 1: no criterion covered a single-field edit.

### Resolution
- `lesson_service.edit_class_service`: a `.save()` in each of the five visibility blocks.
- `eligibility.open-spot-visibility`: a criterion under rule 10.
- Tests: the new file (5 red → green, plus the control); the eligibility, PAD-429, materialised-date and series edit suites green (48).
- Resolved: 2026-09-26T13:32:14Z
