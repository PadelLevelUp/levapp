---
id: B-264
title: "An open calendar kept a class request's hold after the request was accepted, withdrawn or moved"
type: incomplete-rule
severity: high
status: resolved
affects:
  - .specflow/specs/classes/class-requests.spec.md
  - frontend/apps/web/src/pages/CalendarPage.tsx
  - frontend/apps/web/src/components/layout/AppLayout.tsx
  - frontend/apps/mobile/app/(tabs)/_layout.tsx
  - backend/padel_app/services/class_request_service.py
proposed_fix: "Rule 19: every class-request transition refreshes the calendar of both sides and the actor's other devices — the calendar data is invalidated after each action and on class_request_changed, the web calendar refetches on that event, and the server tells the actor too."
opened: 2026-10-02T16:59:31Z
resolved: 2026-10-02T18:14:59Z
---

# B-264: the calendar does not follow a class request

**Source:** PAD-488 (reported in Discord): after accepting a private-lesson request the coach's
calendar kept showing "pedido de aula" until logout and login.

**What happens:** a request's transition (coach accepts, student accepts a proposal, decline,
withdraw, propose / counter-propose) changes the coach's calendar on the server: the hold block
goes, a class appears, or the hold moves. No open calendar shows it:
- **web:** `CalendarPage` keeps events in local state, fetched on mount and on a range change
  only (`CalendarPage.tsx:132`); nothing else refetches it.
- **iOS:** the calendar tab stays mounted; `["calendar-events"]` (staleTime 30 s) refetches on
  app resume, a range change or an error retry only. After an accept in a chat the coach's
  calendar keeps the hold until resume, or until logout clears the cache (the report).
- Every request action invalidates only the request lists (web `MessageBubble.tsx:133`,
  `ClassRequestsSection.tsx:104`; iOS `conversation/[id].tsx:1004`,
  `class-requests-section.tsx:69`), and the realtime handler for `class_request_changed`
  (web `AppLayout.tsx:213`, iOS `(tabs)/_layout.tsx:89`) refreshes the same lists only.
- The server publishes `class_request_changed` to the other party only (`_tell_student`,
  `_tell_coach`), so the actor's other devices get nothing.

**What should happen:** an open calendar on web and iOS, for the coach and the student and on
the actor's other devices, shows the transition without a reload.

**Evidence (Phase 1):**
- Reproduced on web with `e2e/class-requests/pad488-calendar-follows-request.spec.ts` against an
  isolated stack (2026-10-02, 16:5xZ): with the coach's calendar open on the request's week,
  (a) the coach's accept through the API (another device) answered 200 and (b) the student's
  withdraw answered 200, yet the hold card was still on the grid 15 s later in both
  (`toHaveCount(0)` received 1). In (b) the coach's browser did receive `class_request_changed`
  (withdraw calls `_tell_coach`), so the handler, not the connection, is the gap.
- iOS: from the code above, not yet run on a simulator.
- Not a reconnect gap: the event is delivered; its handlers do not touch the calendar.

**Root cause:** `classes.class-requests` rule 6 says every transition notifies the other side,
and its criteria check the server (hold gone, class created). No rule says a calendar that is
already open follows the transition, so neither client was built to refresh it (Type 2).

**Affected specs:**
- Dev: `.specflow/specs/classes/class-requests.spec.md`
- Business: `.specflow/specs-business/classes/student-books-a-class.business.md`

### Change Plan

**Spec to modify:** `.specflow/specs/classes/class-requests.spec.md`
**Change type:** add rule 19 + criteria

**Add rule 19:** "An open calendar follows the request (PAD-488, B-264). Every transition that
changes a calendar (accept, accept-proposal, decline, decline-proposal, withdraw, propose,
counter-propose) publishes `class_request_changed` to the coach and the student, the actor
included, and every client that receives it refreshes its calendar data with the request lists;
the client that performed the action refreshes them too. A calendar already open on web or iOS
shows the class, the moved hold or no hold without a reload."

**Criteria:** accepted on another device → the coach's open calendar drops the hold and shows
the class; the student withdraws → the coach's open calendar drops the hold.

**Then:**
1. Red first: the web E2E above (both cases), plus unit tests of the realtime handlers (web and
   iOS) asserting `class_request_changed` invalidates `["calendar-events"]`, and a backend test
   that the actor is told.
2. Fix: invalidate calendar data in the request actions and the handlers; web `CalendarPage`
   refetches on `class_request_changed`; publish to the actor too.
3. iOS flow (reserved 139) on the simulator: accept in chat, the calendar tab drops the hold.
4. Regression: class-request specs, calendar specs.

### Resolution

- Spec: `classes.class-requests` rule 19 (+2 criteria; known limits recorded), business line in
  `student-books-a-class`.
- Code: `@levelup/hooks` `refreshAfterRequestChange` (request lists, calendar, class sheet,
  dashboard) called by both shells' realtime handlers and every request action, class and join;
  web `CalendarPage` and `DashboardPage` refetch on request events, and only their newest read
  lands; the server tells the coach, the requester and the invitees (`class_request_changed`)
  and both sides of a join decision (`join_request_decided`).
- Tests: web E2E pad488 (3, red first: hold stayed 15 s; late old-week answer replaced the new
  week), backend test_pad488 (8, red first), hooks requestEvents (red against a stub, then on the
  dashboard and the new event type), iOS flows 139/140 (red on staging's code, green here).
- Resolved: 2026-10-02T18:14:59Z
