---
id: B-686
title: "Three web E2E specs were stale against rules that changed under them (PAD-620, PAD-559, query-cache rule 5), not a late-evening time window"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/schedule-calendar/guest-list-dedupe.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/pad371-event-single-occurrence.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/slot-drag-select.spec.ts
proposed_fix: "Bring each spec in line with the rule it now runs into: re-invite after a decline, the class's own date column, and the median class length."
opened: 2026-10-23T19:19:12Z
resolved: 2026-10-23T19:19:12Z
---

# B-686: three E2E specs stale against their rules

**Source:** promotion 19's gate (Session H, 2026-10-22 22:26–22:59Z), Linear PAD-747. Four specs
stayed red when rerun alone on a fresh stack, and identically on prod main 5c29be542. The reruns
happened between 23:44 and 23:59 WEST, so a time window was suspected.

**Not a time window.** At 19:05–19:06Z on 2026-10-23 (20:05 WEST), on a fresh stack at origin/staging
45b126696, three of the four failed on the same assertion lines. Between 23:44 and 23:59 WEST,
Lisbon and UTC are on the same date, and none of the four computes anything that crosses a
boundary there. Each of the three is a spec that a later rule overtook, and the rule is in prod
main too.

**Root causes:**
1. **guest-list-dedupe:142, from the 2nd call (:218), `sent` 0.**
   - Since PAD-620 (#659, 2026-10-11, invitations rule 18), a student who still holds a live
     invitation (`sent` / `queued`) for the occurrence gets no second one
     (`players_with_live_invitation`, `send_manual_notifications`).
   - The spec made three manual invites in a row and expected `sent` 1 each time.
   - Also: the coach's class detail is the de-duplicated list. A recorded "no" outranks a pending
     invite there (`_INVITATION_STATUS_RANK`, PAD-72), so it never shows the newer live invitation.
2. **pad371:82, `occDate` 2026-10-19, expected 2026-10-26.**
   - `goToNextWeek` returns on the first `/calendar?from=` 200. On the desktop grid,
     client.query-cache rule 5 keeps the previous week's columns and cards until the next week
     lands (`CalendarPage.tsx`, `displayedWeekStart`).
   - The bare `.first()` card was this Monday's occurrence. The failure screenshot shows header
     25–31 Oct, and the deleted occurrence is the 19th.
3. **slot-drag-select:119, end "09:00", expected "09:30".**
   - Since PAD-559 (51cedf60d, 2026-10-10, classes.create rule 8c), a single click's end is start
     + the median length of the displayed week's classes (`usualClassMinutes`), or 60 min when
     there are none.
   - The spec still expected the old fixed +90 min. The seed's next-week classes are all 1 h.

**Not this entry:** settings-load-does-not-undo-edits:74 has no time dependency. It races its own
800 ms delayed `/auth/me` under load, passed in the daytime run, and belongs to the load family.

### Change plan (applied)

- **guest-list-dedupe:** invite, then the student answers "no", then invite again, twice. That gives
  three records for one student, the last one live.
  - The live invitation's id comes from the student's own dashboard queue (`vacancy_invite`,
    `notificationEventId`), not from the coach's de-duplicated class detail.
  - Each of the three invites still asserts `sent` 1.
- **pad371:** the card is looked up inside `[data-day-column="<next Monday>"]`, so it can only be
  next Monday's occurrence.
- **slot-drag-select:** the single-click expectation is recomputed by rule 8c from the class's own
  week (Sunday to Saturday), because other specs add classes there.
  - The helper is renamed `slotForTuesday`: columns run Sunday to Saturday since PAD-682.

**Shared helper: fixed by #846, PAD-755.** A first attempt in #844 made `goToNextWeek` wait for
the grid's first `data-day-column` to move forward 7 days. It fell back to the response wait while
the grid was not mounted yet (right after `openCalendar`), so slot-drag-select read a slot of the
current week and recurring-occurrence-delete landed 2 weeks ahead. It was reverted there.
#846 (PAD-755) changes what the helper promises: N is read from the mounted grid, all seven
columns must equal N+1's dates, and the N+1 request, if one was issued, must have its response.
