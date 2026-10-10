---
id: client.query-cache
status: implementing
depends_on: [dashboard.blocks, calendar.view, players.list, messaging.conversations, attendance.validation, messaging.sse-realtime]
implements: ../../specs-business/client/user-returns-to-a-screen-at-once.business.md
governed_by: [R-012, R-014, R-024]
---

# client.query-cache

> Linear: PAD-586 (web) and PAD-592 (mobile). Drafted 2026-10-10 by Session E with Session D
> (wave 14) from the PAD-571 speed study (`.cortex/atlas/decisions/2026-10-09-app-speed-study.md`,
> cause 2: "every screen is a cold fetch"). One policy for both apps.

### Intent
A screen the user saw a moment ago renders from the client cache at once; when its data is older
than the stale window it refreshes in the background without a skeleton. Live changes keep
arriving over SSE and invalidate the cache; nothing polls. The policy is one set of constants
that both apps import, so the two never drift.

### Surfaces
- **Shared**: `frontend/packages/hooks/src/queryDefaults.ts` (new) and the query hooks in
  `frontend/packages/hooks/src/queries.ts` (+ the hooks this leaf adds for presences and the
  roster).
- **Web** `frontend/apps/web`: `App.tsx` builds the `QueryClient` from the defaults; the pages
  dashboard, calendar, players, messages and presences read through the shared hooks instead of
  `useEffect` + `useState`; `AppLayout`'s unread count and pending-validation badge read through
  hooks too.
- **Mobile** `frontend/apps/mobile`: `app/_layout.tsx` builds its `QueryClient` from the same
  defaults (PAD-586 changes only that construction); screen-level changes belong to
  `PAD-592` (foreground gating, chat and grid re-renders, duplicate SSE invalidation).
- **Backend** — no change.

### Entities
- **READS:** everything the five pages read today (dashboard payload, calendar events, coach
  players, conversations, presence stats, pending validation, unread count, coach levels).
- **WRITES:** none.

### Rules

1. **One policy, one file.** `packages/hooks/src/queryDefaults.ts` exports
   `QUERY_STALE_TIME_MS = 60_000`, `QUERY_GC_TIME_MS = 10 * 60_000`, `QUERY_RETRY = 1` and
   `queryClientDefaultOptions` (`{ queries: { staleTime, gcTime, retry } }`). Web `App.tsx` and
   mobile `app/_layout.tsx` construct their `QueryClient` with `queryClientDefaultOptions`; no
   other `staleTime`/`retry` default exists in either app. A per-query override is allowed only
   with a comment naming the reason (today: `retry: false` on class-instance and class-evaluation
   reads, which must fail fast).
2. **Return within the stale window = cache, no request.** A query whose data is younger than
   `QUERY_STALE_TIME_MS` renders from cache on mount and on window focus (web) or app foreground
   (mobile) with no network request.
3. **Return after the stale window = cache first, refresh behind.** Older data renders at once
   (`isPending` is false, no skeleton) and one background refetch replaces it; `isFetching` may
   show a subtle indicator, never a blank state.
4. **Freshness is event-driven (R-014).** SSE events invalidate by `queryKeys` as today
   (`requestEvents.ts`, the web and mobile hubs); mutations invalidate the keys they change. No
   `refetchInterval`, no timers.
5. **Range and page changes keep the previous data.** Calendar week/month ranges, paginated
   lists and conversation pages use `placeholderData: keepPreviousData`, so the previous range
   stays on screen until the next one arrives.
6. **The five web pages read through the shared hooks.** Dashboard `useDashboard`; calendar
   `useCalendarEvents` + `useCoachLevels` + the roster hook; players `useCoachPlayersPaginated`;
   messages `useConversations` (page 1 cached; further pages appended as today) and
   `useUnreadCount`; presences `usePresenceStats`, `usePresenceTrend`, `usePendingValidation`,
   `usePendingValidationCount` and the roster hook (added to `packages/hooks` by this leaf, one
   `queryKeys` entry each). No page keeps server data in `useState` populated by `useEffect`.
7. **Shared reads are fetched once per stale window across screens.** The coach roster
   (`/coach_players`), coach levels, the unread count and the pending-validation badge each have
   one key; calendar, presences, player detail and `AppLayout` share it, so moving between them
   inside the window makes no request for them.
8. **Duplicate and probe requests go.** Presences requests the trend once on load (today twice);
   a `message_created` SSE event on the messages page invalidates the conversations key instead
   of probing `getConversation(id, {limit: 1})`.
9. **Web and iOS together (R-024).** The policy file and both `QueryClient` constructions ship
   in PAD-586; the mobile screens' behaviour changes ship in PAD-592 and cite this leaf. Neither
   app hard-codes a number.
10. **Measured.** The web E2E `client/query-cache.spec.ts` counts `/api/` requests across
    navigations (R-021 names); `packages/hooks` has a unit test on the defaults file; the
    backend baseline (`backend/scripts/perf_baseline.py`) is unchanged by this leaf (no backend
    change) and is cited only to show statement counts per request did not move.

### Acceptance Criteria

#### Both apps build their QueryClient from the shared defaults (rule 1)
- **Given** `packages/hooks/src/queryDefaults.ts`
- **When** `apps/web/src/App.tsx` and `apps/mobile/app/_layout.tsx` are read
- **Then** each passes `queryClientDefaultOptions` to `new QueryClient`, and a grep for
  `staleTime:` or `retry:` outside the defaults file finds only commented per-query overrides

#### Back within a minute: no request (rule 2)
- **Given** a coach signed in on the web at 1280 × 800 who opened `/players` (one
  `GET /api/app/coach_players_paginated`) and then `/calendar`
- **When** they navigate back to `/players` 10 s later
- **Then** the list is visible immediately (`players-list` with the same rows, no skeleton) and
  the request count for `coach_players_paginated` during that navigation is 0

#### Back after a minute: cache first, one refresh behind (rule 3)
- **Given** the same coach, with `/players` data 61 s old (the test advances the query client's
  clock or waits with a shortened `QUERY_STALE_TIME_MS` injected through an env override used
  only by tests)
- **When** they navigate back to `/players`
- **Then** the list is visible immediately with the cached rows, exactly one
  `coach_players_paginated` request follows, and the rows update in place without the skeleton

#### Dashboard behaves the same (rules 2, 3)
- **Given** a coach who opened `/` (one `GET /api/app/dashboard`) and then `/messages`
- **When** they return to `/` within the window
- **Then** `dashboard-kpis` is visible at once and no `dashboard` request is made

#### Shared reads are fetched once (rule 7)
- **Given** a coach who opens `/calendar`, then `/presences`, then `/calendar` within the window
- **When** the requests are counted
- **Then** `GET /api/app/coach_players` and `GET /api/app/coach_levels` each happened once, and
  `GET /api/app/messages/unread_count` at most once

#### Range change keeps the previous week on screen (rule 5)
- **Given** a coach on the calendar week view with events rendered
- **When** they press next week
- **Then** the current week's events remain visible until the next week's response arrives
  (no empty grid between), and then the new week renders

#### Presences requests the trend once (rule 8)
- **Given** a coach opening `/presences`
- **When** the page settles
- **Then** `GET /api/app/presence_trend` was requested exactly once

#### A live message invalidates, it does not probe (rule 8)
- **Given** the coach on `/messages` with the list loaded
- **When** a `message_created` SSE event arrives for a listed conversation
- **Then** the conversations list is refetched once (`GET /api/app/conversations`) and no
  `GET /api/app/conversation/<id>?limit=1` is made

#### No polling (rule 4)
- **Given** the web app source
- **When** `refetchInterval` and `setInterval` are grepped under `apps/web/src` and
  `packages/hooks/src`
- **Then** no query sets `refetchInterval` (the two countdown timers and the tactical board are
  not queries)

#### Mobile reads the same constants (rule 9)
- **Given** `apps/mobile/app/_layout.tsx`
- **When** it is read
- **Then** its `QueryClient` is built from `queryClientDefaultOptions` and no numeric
  `staleTime` remains in the file

#### Defaults are unit-tested (rule 10)
- **Given** `packages/hooks/src/queryDefaults.test.ts`
- **When** vitest runs it
- **Then** it asserts the three constants and that `queryClientDefaultOptions.queries` carries
  exactly them

### Notes
- Why one number: the study measured every screen as a cold fetch; a minute covers the "look,
  switch, come back" loop without hiding anything an SSE event would not already push. Mobile
  used 30 s; the shared value is the longer one because both apps now rely on invalidation, not
  staleness, for live data.
- `gcTime` 10 min keeps a screen's data through a normal session without unbounded memory on
  the calendar's many ranges.
- The web `AppLayout` stays mounted per page (19 pages render it); the cache, not a routing
  change, is what makes its badges cheap. A layout route is a later cleanup if wanted.
- The test clock: a Playwright spec cannot wait 61 s per case; the web app reads an optional
  `VITE_QUERY_STALE_TIME_MS` only when `import.meta.env.MODE !== "production"`, which the E2E
  config sets to 2000 for the after-the-window cases. Production builds never read it.
- OPEN: none.
