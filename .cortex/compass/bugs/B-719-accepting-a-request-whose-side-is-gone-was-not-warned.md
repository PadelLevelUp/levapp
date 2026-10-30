---
id: B-719
title: "A coach accepting a join request whose side had no open spot left was never warned: the student silently took a spot of the other side"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - classes.join-requests
  - backend/padel_app/services/class_join_request_service.py
  - frontend/apps/web/src/components/class-requests/ClassRequestsSection.tsx
  - frontend/apps/web/src/components/messages/MessageBubble.tsx
  - frontend/apps/mobile/src/features/class-requests/class-requests-section.tsx
proposed_fix: "join-requests rule 7a: a manual accept re-checks the request's side; with no open spot of that side it answers the same 409 ineligible as rule 7, with reasons, requestedSide and openSides, and the clients show both warnings in one confirmation."
opened: 2026-10-30T15:40:00Z
---

# B-719: accepting a request whose side is gone was not warned

**Source:** Linear PAD-808 (sub-ticket 6 of PAD-802, owner priority).

**What happens:** a student asks to join a class for the left side while a left spot is open. Before
the coach answers, the left spot is taken or re-counted to the right. When the coach accepts, the
accept goes through with no warning: `vacancy_for_joiner` falls back to the oldest open spot (a
right one), and `_side_for_enrolment` still writes left on the student's presence. The coach never
learns that the class now has one more left player in a right spot.

**What should happen:** the coach is warned, as for eligibility, and decides. When both apply, one
confirmation carries both.

**Root cause:** rule 7 re-checks only the eligibility bar at accept time. Rule 20 checks the side
when the request is made and when the automatic accept runs (`_accept_automatically` returns early
on `side_has_spot` false), but the manual accept had no such rule, so `_decide_join_request` never
looked. An incomplete rule: the side check existed for two of the three paths.

**Evidence:** `backend/padel_app/tests/test_pad808_accept_warns_when_the_side_is_gone.py` on staging
bbe80c331, 2026-10-30 15:29:57Z: the accept did not raise (1 failed, 3 controls passed).

**Affected specs:**
- Dev: `.specflow/specs/classes/join-requests.spec.md` (new rule 7a, rule 15's wire, two criteria)
- Business: none; `classes/student-joins-and-views-classes` does not describe sides.

### Change Plan
1. Spec: rule 7a, the 409's added fields in rule 15, two criteria.
2. Backend: in `_decide_join_request`, without `confirm`, compute the side part (`side_has_spot` on
   the request's side against the open spots) alongside the eligibility part, and refuse once with
   both.
3. Web and iOS: the class-requests section and the chat bubble show the side part in the existing
   confirmation, both parts when both apply.
