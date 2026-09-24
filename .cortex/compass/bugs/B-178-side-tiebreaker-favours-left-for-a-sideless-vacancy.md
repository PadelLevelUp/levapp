---
id: B-178
title: "The \"Playing side\" tiebreaker ranked left-side players first for a vacancy with no side"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "Invitations rule 4b gains a sentence: a vacancy with no side ranks every side equally. _build_sort_key appends a constant in the side-less branch; pinned by test_pad420_side_sort_no_side.py."
opened: 2026-09-24T18:05:18Z
---

# B-178: the side tiebreaker favoured left for a side-less vacancy

**Source:** PAD-420. Session-B found it while answering a coach-founder's question about filling a 16-place class that has 6 fixed students (production `origin/main aa7314be4`).

**What happens:** with the "Playing side" priority criterion switched on, `_build_sort_key` ranks candidates for a vacancy with `side=None` by `0 if cp.side == "left" else 1`. So every left-side player outranks every right-side, `both` and unset player. Every structural vacancy (a never-filled spot, `_create_structural_vacancies`) has no side, so the bias applies to every empty spot in an under-capacity class. `invite_simulation_service` reuses the same sort key, so the coach's invite preview showed the same order.

**What should happen:** a vacancy with no side has no side to match, so the tiebreaker favours none; the remaining criteria decide.

**Root cause:** Type 2, an incomplete rule. `notifications.invitations` rule 4b defines the side preference only for a sided vacancy (exact side, then `both`, then the rest). Rule 4a says a null-side vacancy *accepts* any player but nothing says how it *ranks* them. The code filled the gap with a deliberate "legacy left first" branch, commented as keeping behaviour unchanged. No spec rule or decision records a reason for it.

**Evidence (Phase 1, 2026-09-24):**
- Reproduced on staging `586912387`. The new test failed with `{'left': (0,), 'right': (1,), 'both': (1,), None: (1,)}`: left alone gets rank 0. A right-side player listed first was reordered behind a left-side one (`[2, 1] != [1, 2]`).
- The sided-vacancy control (`right` → right, both, left) passed on the unfixed code, which isolates the defect to the side-less branch.
- `DEFAULT_PRIORITY_CRITERIA` ships `playing_side` disabled (`models/notification_config.py:8-15`), so only coaches who switched it on were affected.
- No existing test asserted the left-first order.

**Affected specs:**
- Dev: `.specflow/specs/notifications/invitations.spec.md` (rule 4b, plus a new criterion)
- Business: none changed. The business outcome never promised a side preference.

### Change Plan (Type 2)

1. Rule 4b gains: "A vacancy with no side ranks every side equally (PAD-420)".
2. Add the criterion "The playing-side tiebreaker favours no side for a vacancy with no side".
3. The test `test_pad420_side_sort_no_side.py` must be red on the current code.
4. In `_build_sort_key`, append `0` in the `vacancy_side is None` branch.
5. Run the side, config and simulation tests, then the full backend suite.

Out of scope: *balancing* sides across never-filled spots is a separate, owner-decided feature (PAD-421).
