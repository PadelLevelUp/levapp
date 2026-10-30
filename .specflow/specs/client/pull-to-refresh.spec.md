---
id: client.pull-to-refresh
status: implementing
depends_on: [client.query-cache, client.request-timeout, players.list, messaging.conversations, calendar.view, attendance.validation]
implements: ../../specs-business/client/user-returns-to-a-screen-at-once.business.md
governed_by: [R-024]
---

# client.pull-to-refresh

> Linear: PAD-786. Added 2026-10-29 by SessionB from coach 2's report on iOS build 34: "lists get
> stuck pulling down", in the Presences tab's "Aulas por validar" sheet (B-704).

### Intent
On the phone, pulling a list down reloads it, and the spinner that appears always comes down:
on success, on failure and on a request that never answers. In the attendance sheet, a drag also
puts the keyboard away, so the walk-in search can never trap the coach behind it.

### Surfaces
- **Mobile** `frontend/apps/mobile`: `src/hooks/usePullToRefresh.ts` and `src/lib/pull-refresh.ts`
  (new); the Players tab (`app/(tabs)/players.tsx`), Messages (`app/(tabs)/messages.tsx`), the
  Calendar's day list (`app/(tabs)/calendar.tsx`), the Presences tab
  (`src/features/presences/PresencesScreen.tsx`) and its validation sheet
  (`src/features/presences/ValidateClassesSheet.tsx`); `useRefreshCoachRoster` in
  `src/features/presences/hooks.ts`.
- **Shared**: `common.refreshFailed` and `common.refreshFailedBody` in `frontend/src/locales`.
- **Web**: no change. A browser has no pull gesture on these pages and reloads with the page;
  the shared half of PAD-786 is `client.request-timeout`, which web gets (R-024 reason).
- **Backend**: an E2E-only stall switch for flows 311 and 312 (rule 6). No product change.

### Entities
- **READS:** what each screen already reads (coach players, conversations, calendar events,
  presence stats and trend, pending validation and its count, the roster).
- **WRITES:** none.

### Rules
1. **Where a pull works (iOS).** A `RefreshControl` on: the Players list; the Messages list; the
   Calendar's day list; the Presences tab; and the list inside the "Aulas por validar" sheet. A
   pull reloads what that screen shows:
   - Players: drops the roster's module cache (`invalidateCoachPlayersCache`), then refetches the
     page;
   - Messages: refetches page 1 and, once it has arrived, drops the pages appended by scrolling;
   - Calendar: refetches the shown range;
   - Presences tab and sheet: refetch the stats, the trend, the week's pending validation and its
     count, and the roster (the walk-in picker's source).
   A pull never discards what the coach has typed or marked in the sheet: its marks and walk-ins
   are local state and stay.
2. **Where it does not.** The Calendar's week and month grids: they sit in `GridWithSheet`, whose
   `DaySheet` owns the vertical pan and whose `TimeGrid` scrolls to the working hours, so a pull
   there would fight both. The Dashboard keeps the pull it already had.
3. **The spinner always comes down.** `refreshing` is the hook's own state, never a query's
   `isRefetching`: on with the pull, off when the refresh settles. A refresh still pending after
   `REFRESH_SPINNER_MAX_MS` (2 × `REQUEST_TIMEOUT_MS` + 5 s = 45 s, past rule 3 of
   `client.request-timeout`) is let go: the spinner comes down and the request finishes or fails
   behind it. This also covers a fetch React Query paused while offline. A second pull while one
   runs is ignored; a background refetch (SSE, foreground) never shows the pull spinner.
4. **A failed pull says so.** When any request of the pull failed, or the bound of rule 3 was
   reached, a toast says "Não foi possível atualizar" with "Verifica a ligação e puxa a lista
   para baixo para tentar de novo." (`common.refreshFailed`, `common.refreshFailedBody`). The
   screen otherwise behaves as on any failed read: where it already shows `ErrorState` on a query
   error (Players, Messages, Calendar, the Presences tab's stats), that state and its retry
   appear as before. The toast layer stacks above every dialog (`zIndex` 100 over the dialogs'
   `z-50`, both in the root PortalHost): before, a toast raised inside the attendance sheet drew
   behind it, unseen (found by flow 312).
5. **A drag puts the sheet's keyboard away (B-704).** Both scroll areas of the validation sheet
   (the class list and a class's detail) use `keyboardDismissMode="on-drag"`. The sheet is a
   centred portal dialog that never moves above the keyboard (`dialog-size.ts`), so with the
   walk-in search focused the keyboard covered the matches, Cancel, Open and Validate, and a pull
   did nothing. The list also bounces when it is short (`alwaysBounceVertical`), so an empty week
   still takes a pull.
6. **The E2E stall switch.** Under `E2E_DEBUG_ENDPOINTS` only, `POST /api/app/debug/stall`
   `{ "path": "/api/app/…", "seconds": n }` makes every request whose path starts with `path`
   wait `n` seconds (at most 120) before it is handled, until `DELETE /api/app/debug/stall`. Like
   every debug route both take a JWT as well as the flag: without a token they answer 401, and
   with the flag off 404; either way nothing waits. Flows 311 and 312 use it to hold a list's
   request past the client timeout.

### Acceptance Criteria

#### A refresh that succeeds brings the spinner down (rule 3)
- **Given** `runRefresh` with a refresh that resolves
- **When** it settles
- **Then** the outcome is "ok"

#### A refresh that fails brings the spinner down and says so (rules 3, 4)
- **Given** `refetchAll` over two refetches, one resolving with `{ isError: true }`
- **When** `runRefresh` runs it
- **Then** the outcome is "failed"

#### A refresh that never settles is let go at the bound (rule 3)
- **Given** a refresh that never resolves, and fake timers
- **When** `REFRESH_SPINNER_MAX_MS` (45 000 ms) passes
- **Then** `runRefresh` resolves "timed-out", and not one millisecond before

#### Every main list has the pull (rules 1, 2)
- **Given** the sources of the Players, Messages and Calendar screens, the Presences screen and
  the validation sheet
- **When** they are read
- **Then** each list named in rule 1 has a `RefreshControl` whose `refreshing` comes from
  `usePullToRefresh`, never from `isRefetching`, and the sheet's scroll areas both set
  `keyboardDismissMode="on-drag"`

#### A pull on a stalled list ends with the toast (rules 3, 4; iOS, flow 311)
- **Given** a coach on the Players tab, with the E2E backend stalling
  `/api/app/coach_players_paginated` for 60 s
- **When** they pull the list down
- **Then** within 50 s the spinner is gone and "Couldn't refresh" is shown

#### The sheet's keyboard goes away on a drag, and its pull refreshes (rules 1, 5; iOS, flow 312)
- **Given** a coach in "Aulas por validar" with a class expanded and the walk-in search focused,
  the keyboard covering the class's Validate button
- **When** they drag the list down
- **Then** the keyboard is gone and Validate is visible
- **And** with `/api/app/class_instances/pending_validation` stalled, a pull on the sheet's list
  ends within 50 s with "Couldn't refresh", the sheet still open and the class still expanded

#### The stall switch exists only under the E2E flag (rule 6)
- **Given** the Flask test app
- **When** `POST /api/app/debug/stall` is called with the flag off, and then with it on
- **Then** off: 404 and no request waits; on: a request under the path waits the given seconds,
  and after `DELETE` none does
- **And** without a token both answer 401 and nothing waits (the route-map guard in
  `test_frontend_api_authz.py` holds every `/api/app` write to a JWT)

### Notes
- Web is untouched by this leaf (rule 1's surfaces are phone gestures); web's share of PAD-786 is
  the shared timeout (`client.request-timeout`). Written here and in the PR body (R-024).
- The bound of rule 3 is generous on purpose: a slow but working server (3–6 s) always lands
  before it, so only a request that would never end meets it.
- OPEN: lifting the validation sheet above the keyboard (so the search's matches stay visible
  while typing) is a layout change to the shared dialog; not in this leaf.
