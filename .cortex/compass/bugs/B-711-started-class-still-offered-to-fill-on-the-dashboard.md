---
id: B-711
title: "A class that had already started was still offered to fill on the coach's dashboard, and its hero read \"A SEGUIR\""
type: incomplete-rule
severity: medium
status: resolved
affects:
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/coach_home.py
  - frontend/apps/web/src/components/dashboard/coach/NextClassHero.tsx
  - frontend/apps/web/src/components/dashboard/coach/Schedule7Days.tsx
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
proposed_fix: "dashboard.blocks rule 12: needs-you offers empty seats only for a class that has not started; a running class is inProgress on the hero (\"A DECORRER · start–end\") and on its next-7-days row, which loses its seats badge and its Convidar."
opened: 2026-10-30T09:30:00Z
resolved: 2026-10-30T09:45:00Z
---

# B-711: a started class was still offered to fill on the coach's dashboard

**Source:** PAD-792, from the owner's report with a screenshot of the coach dashboard (web) on
Thursday 29 Oct 2026 at 20:23.

**What happens:** a class from 19:30 to 21:00, with 0 of 2 seats taken, had been running for almost
an hour. The dashboard still showed it in three places as if it needed students:
- "Precisa de ti": "2 vagas livres", with "Convidar 2 jogadores" and "Mais tarde", counted in
  "3 coisas precisam de ti";
- the dark hero: "A SEGUIR · 19:30";
- "Próximos 7 dias": the badge "Vazia" and the button "Convidar".

**What should happen:** at its start time the class leaves "Precisa de ti". While it runs the hero
reads "A DECORRER · 19:30–21:00", and its row in the next 7 days has no seats badge and no Convidar.
When it ends, the hero moves to the next class that has not started, with "A SEGUIR".

**Root cause (observed):** every coach block cuts its window with rule 9's overlap test
(`cut_events` in `coach_home.py`: a class is in when its END is after `now`). That keeps a running
class on purpose: PAD-754 pinned it as the hero and the first row of the next 7 days. Nothing then
asked whether the class had started. The empty-seats items, the schedule's badge and Convidar, and
the hero's eyebrow (`isToday` alone picks "A SEGUIR · start", web `NextClassHero.tsx` and mobile
`blocks.tsx`) were written for classes still to come. dashboard.blocks had no rule for a class that
has started: an incomplete rule.

**Evidence that selected the type:** `test_pad792_started_class_on_dashboard.py` on staging code
(e2aad1ed2), 2026-10-30 09:33:29Z: 6 failed. The class was an `empty_seats` item at its start
time and while running, and no block carried a started state. The web and iOS render tests failed
2/3 each on staging's components (09:40:06Z, 09:39:33Z): the hero read `upNext` and the running row
kept "Vazia" (web: and Convidar).

**Not the cause:** the time zone. The dashboard's `now` is `club_now_naive()` and class times are
Lisbon wall clock (R-023), so the cut is already the class's start time in the coach's zone. Rule
9's text and `_event_end`'s docstring still called the strings UTC (stale since PAD-256); the
wording is corrected.

**Found on the way:** the student home never shows a running class at all. Its loader keeps
`start_datetime >= now` (calendar_helpers), so at the start time the student's hero is already the
next class. Rule 12d states it; a student "A DECORRER" is out of PAD-792.

**Affected specs:**
- Dev: `.specflow/specs/dashboard/blocks.spec.md` (rule 12; rule 9 wording; PAD-740's Saturday
  criterion, whose class was running at 23:30, now uses one that has not started)
- Business: `.specflow/specs-business/dashboard/user-relies-on-the-dashboard.business.md`

### Change plan (type 2, incomplete rule)

Add dashboard.blocks rule 12 with criteria; `has_started(event, now)` in `coach_home.py`; needs-you
skips started classes; the hero and schedule rows carry `inProgress` (rows without `inviteHref`);
web and iOS render it.

### Resolution

- Spec changes: dashboard.blocks rule 12 (a–e) and five criteria; rule 9 wording; PAD-740's
  Saturday-edge criterion; the business rule on started classes.
- Tests: `backend/padel_app/tests/test_pad792_started_class_on_dashboard.py` (7);
  `frontend/apps/web/src/components/dashboard/coach/InProgressClass.test.tsx` (3);
  `frontend/apps/mobile/src/features/dashboard/in-progress-class.test.tsx` (3);
  `test_pad740_needs_you_current_week.py` Saturday edge updated.
- Code: `has_started` and `inProgress` in `coach_home.py` (`player_home.py` passes `now` to the
  shared schedule builder); `inProgress` in `@levelup/types`; the eyebrow and the row in web
  `NextClassHero.tsx` / `Schedule7Days.tsx` and mobile `blocks.tsx`; `dashboard.hero.inProgress`
  in pt and en.
- Resolved: 2026-10-30.
