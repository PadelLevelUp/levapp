---
id: B-293
title: "A standing waiting-list entry queued its player for classes after it ended, and kept doing so once expired"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/services/notification_service.py
proposed_fix: "_fan_out_standing_entry and _sync_standing_entries_for_new_instance skip an expired entry and any class that starts at or after the entry's end."
opened: 2026-10-03T15:25:52Z
resolved: 2026-10-03T15:25:52Z
---

# B-293: a standing entry queued its player past its end

**Source:** PAD-507, mapping the standing waiting list before adding a chosen end date (2026-10-03).

**What happened:** an entry's `expires_at` was read in exactly one place, the invitation path, which skips and deactivates an expired entry when a spot is being filled. The two places that *create* per-class waiting-list rows never read it:
- `_fan_out_standing_entry` (on add) queued the player for every upcoming class of the coach, including classes months after the entry's end.
- `_sync_standing_entries_for_new_instance` (on materialisation) queued the player for a new class even when the entry had already expired.

The rows were harmless to filling (the invitation path still refused an expired entry), but the student showed as "on the waiting list" for classes their entry did not cover, and `activeClassCount` in the coach's standing list counted them.

**Why it matters now:** with PAD-507 an entry can end on any date up to 12 months away and be renewed or shortened, so the end has to bound the rows it creates.

**Evidence (red before the fix):** `test_pad507_standing_end_date.py`:
- `test_an_entry_is_not_queued_for_classes_after_its_end`: `[True] == []` for the class after the end.
- `test_a_new_class_after_the_end_or_of_an_expired_entry_gets_no_row`: the same for a materialised class.

**Which guard should have caught it, and did not:** `notifications.waiting-list` rule 11 described lazy expiry for *reading* the list; no rule said what an entry's end means for the rows it creates.

### Resolution
- Code: both functions skip an expired entry and any class starting at or after the end; renewing deactivates the entry's rows beyond a shortened end and fans out to a lengthened one.
- Spec: `notifications.waiting-list` rules 2 and 3, criterion "An entry queues its player only until its end".
