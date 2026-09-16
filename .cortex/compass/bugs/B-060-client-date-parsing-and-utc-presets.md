---
id: B-060
title: "Client dates: bare dates parsed as UTC, presets on the UTC day, and a Hermes-unsafe parse"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - frontend/apps/web/src/components/calendar/AddClassSheet.tsx
  - frontend/apps/web/src/components/calendar/AddEventSheet.tsx
  - frontend/apps/web/src/pages/AvailabilityPage.tsx
  - frontend/apps/web/src/components/calendar/EventDetailSheet.tsx
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/web/src/components/attendance/dateRanges.ts
  - frontend/apps/web/src/pages/PresencesPage.tsx
  - frontend/apps/web/src/components/settings/SeasonsSection.tsx
  - frontend/apps/mobile/src/features/attendance/date-ranges.ts
  - frontend/apps/mobile/src/features/presences/hooks.ts
  - frontend/apps/mobile/src/features/settings/seasons-section.tsx
  - frontend/apps/mobile/src/features/settings/understand-invites-tutorial.tsx
  - frontend/apps/mobile/src/features/calendar/attendance-decline.ts
proposed_fix: "Parse bare dates with parseISODate, compute presets and weeks from the club's date (clubTodayISO), and build class date-times from parts (localDateTime)."
opened: 2026-09-10T00:00:00Z
---

# B-060 — Client dates: bare dates parsed as UTC, presets on the UTC day, a Hermes-unsafe parse

**Source:** the PAD-256 client inventory (2026-09-10). The draft listed these as the same under
either storage option. The coordinator assigned B-060 and asked for one web + iOS change.

**What happened:**
1. **Bare dates parsed as UTC (web).** `new Date("YYYY-MM-DD")` is UTC midnight. On any device west
   of UTC it is the previous local day, so:
   - the recurring-class, event and blocker forms preselected the wrong weekday and computed their
     default end date from the wrong day;
   - the class and event sheets printed the day before.
2. **Presets on the UTC day (web and iOS).** The attendance presets (`1W`/`1M`/`1Y`), the Presences
   week, the seasons preview's "today" and the invites tutorial's range were computed from the UTC
   date. Between 00:00 and 01:00 Lisbon in summer, that is still the previous day, week or month,
   while the server (PAD-256) already uses the club's.
3. **Hermes-unsafe parse (iOS).** `hasClassStarted` built `new Date("YYYY-MM-DDTHH:MM")`. Hermes may
   return Invalid Date for an offset-less string. The guard then read "not started" and kept
   offering the decline after the class began.

**Fix:**
- `@levelup/config` gains `clubTodayISO` / `clubTodayUtcDate`, which give today's date on the
  `Europe/Lisbon` clock (falling back to the UTC date if the runtime has no zone data), and exports
  `localDateTime`.
- The presets and `weekBounds` on both shells compute from the club's date.
- The web forms and sheets parse bare dates with `parseISODate`.
- `hasClassStarted` builds the class time from its parts with `localDateTime`.
