---
id: B-077
title: "The coach's counter-proposal dead-ends: the student is asked in chat but cannot answer there, and cannot propose another time anywhere"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-09-11T14:10:00Z
affects:
  - classes.class-requests
  - backend/padel_app/services/class_request_service.py
  - backend/padel_app/modules/frontend_api.py
  - frontend/apps/web/src/components/messages/MessageBubble.tsx
  - frontend/apps/web/src/components/class-requests/ClassRequestsSection.tsx
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/class-requests/class-requests-section.tsx
proposed_fix: "Rule 10: the student may counter-propose while `countered` (slot re-validated, hold moved, back to `pending`, coach told, no round limit); rule 6: the proposal message carries the student's answers on web and iOS while the live status is still `countered`; the Availability row gets the third button."
opened: 2026-09-11T13:30:00Z
---

# B-077 — The coach's counter-proposal dead-ends for the student

**Source:** founders' note 2026-09-11 (PAD-281): "se professor propuser novo horário, o aluno
não tem como aceitar, rejeitar ou propor horário de novo. O fluxo devia continuar."

**What happens:**
- The coach's `propose` turns the request `countered`, moves the hold and sends the student a
  system message "O treinador propôs outro horário: … Aceitas?" with a push that deep-links to
  the conversation (`class_request_service.py`, `_tell_student`, kind `proposed`).
- The message is `message_type: text` with `msg_metadata.classRequest`; neither chat bubble
  renders anything for that metadata (`MessageBubble.tsx` and the mobile conversation screen
  contain zero references to `classRequest` — checked 2026-09-11 on staging 72ac170a8). The
  student reads a question with nothing to press.
- The only place the student can answer is the "Pedidos de aula" section under the Availability
  tab, which the push never points at. Those buttons work (PAD-104's pytest module, 9 of 9 green
  on the same commit) — the founders never reached them.
- "Propose another time" from the student does not exist on any layer: the route table has
  `accept-proposal`, `decline-proposal`, `withdraw` for the student and `propose` for the coach
  only (`frontend_api.py:1858-1887`); rule 5 of the spec stops at accept / decline.

**What should happen:** after a counter-proposal the request returns to the student, who can
accept (the class is created), decline (the request closes, coach told) or propose another time
(back to the coach as `pending`), from where they were told; every transition notifies the other
side. PAD-104 asked for exactly this ("fluxo tipo Outlook/Google Calendar").

**Root cause:** `classes.class-requests` rule 5 lists only two student answers and rule 6 says
the student is "told" without requiring the telling to be answerable; the business journey's
step 5 has the same two answers. The code implements the incomplete rules faithfully.

**Evidence:** route grep above; `grep -c classRequest` on both bubbles = 0; pytest
`test_pad104_class_requests.py` green (the section buttons are not the bug).

**Affected specs:**
- Dev: `.specflow/specs/classes/class-requests.spec.md` (rules 5, 6; new rule 10)
- Business: `.specflow/specs-business/classes/student-books-a-class.business.md` (journey 5)

### Change Plan

**Spec to modify:** `.specflow/specs/classes/class-requests.spec.md`
**Change type:** Add rule 10 + amend rules 5 and 6 + one acceptance criterion

**Rule 10 (new).** The student's counter-proposal: `POST /app/class-requests/<id>/counter-proposal
{date, startTime, endTime}` while the request is `countered`. The slot is validated exactly like a
new request (rule 2 length, rule 7 past / free, the request's own hold excluded), the hold moves,
the request turns `pending` again and the coach is told (rule 6). Rounds are unlimited; the coach
may accept, decline or propose again. Any other status answers `409 not_countered`.

**Rule 5 (amended).** "… `decline-proposal` closes the request … A student may `withdraw` while
`pending` or `countered`, or counter-propose (rule 10) while `countered`."

**Rule 6 (amended).** The proposal message carries the student's answers: while the request's
live status is still `countered`, the bubble on web and iOS offers Accept / Decline / Propose
another time (the last opens the Availability section). Once the status has moved on, the bubble
shows the outcome instead and a late answer degrades to the `409` code, never an error page.

**Criterion:** "The student counter-proposes" — Given a `countered` request at 15:00–16:00, When
the student proposes 17:00–18:00, Then the request is `pending` at 17:00–18:00, the hold is at
17:00–18:00, the coach is told, and the coach's accept books 17:00–18:00.

**Business spec:** journey step 5 → "A proposed time goes back to the student, who accepts,
declines or proposes another time — as many rounds as it takes."

**Then:** red pytest for rule 10 + route; red Playwright spec for the chat bubble round trip;
code on backend, web, iOS; regression; resolve here.

### Resolution

- Spec changes: `.specflow/specs/classes/class-requests.spec.md` (rules 5, 6, new rule 10, two
  criteria), `.specflow/specs-business/classes/student-books-a-class.business.md` (journey 5, 6).
- Tests added: `backend/padel_app/tests/test_pad281_counter_proposal.py` (5, red first),
  `frontend/packages/config/src/class-request-message.test.ts` (8, red first),
  `frontend/apps/web/e2e/class-requests/class-request-counter-proposal.spec.ts` (chat bubble →
  Availability picker → counter-proposal → second round → accept from the bubble).
- Code: `counter_proposal_service` + `POST /app/class-requests/<id>/counter-proposal`;
  `free-blocks?excludeRequestId`; every class-request message carries `slot`, the student's
  message is kind `counter_proposal`; an accept names the slot it accepts (`409 slot_changed` otherwise) and deciding reads lock the row (review of #203); `classRequestBubbleState` (packages/config) drives the proposal
  card on web `MessageBubble` and iOS `message-bubble` (student answers a `proposed`, coach
  answers a `countered`; Propose deep-links to the Availability section / the inbox with
  `?proposeFor=`); the Availability section (web + iOS) gets the third button with a free-block
  picker; `class_request_changed` invalidates the live row on both shells.
- Resolved: 2026-09-11 (PAD-281).
