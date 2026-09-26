---
id: B-196
title: "No test proved an excluded player is left out of invitations"
type: test-defect
severity: low
status: resolved
affects:
  - notifications.config
  - backend/padel_app/services/notification_service.py
proposed_fix: "Add the criterion and a regression test on evaluate_candidates and _send_invitation_batch."
opened: 2026-09-25T13:06:07Z
resolved: 2026-09-25T13:06:07Z
---

# B-196: the invitation path's exclusion was untested

**Source:** PAD-449 (owner/founder feedback, 2026-09-24): "excluded players show as an ID after refresh". It also asked to confirm that the exclusion itself works. The id-instead-of-name half is B-168, fixed by #424 and live since wave 7. The id range was reserved for Session-D.

**Finding:** `restrictions.excludedPlayers` is honoured in two places.
- The waiting-list placement is tested (`test_pad128_eligibility::test_waiting_list_placement_honours_excluded_players`).
- The invitation ranking (`evaluate_candidates`, the `excluded_by_coach` stage, then `_send_invitation_batch`) had no test at all. The simulation's `excluded_by_coach` reason had none either.
- The behaviour was right, but nothing pinned it.

**Evidence:** `test_pad449_excluded_player_is_not_invited.py`.
- It passes on staging (86a9ab42f).
- Switching the stage off (`if False and str(pid) in excluded_player_ids`) turns `test_an_excluded_player_is_not_invited` red: the excluded student is invited.

## Diagnostic tree
1. Dev spec: `notifications.config`. Yes.
2. Rule: rule 6 names `excludedPlayers`, and it is correct.
3. Criterion: none said "never invited". **Test defect** (a missing criterion plus a missing test). The code was right.

### Resolution
- **Spec:** `notifications.config` gets the criterion "An excluded player is never invited (PAD-449)".
- **Tests:** `test_pad449_excluded_player_is_not_invited.py`, 2/2. The exclusion-off mutant is killed. The second test pins #424's name map for the same coach.
