---
id: mobile.interaction-performance
status: draft
depends_on: [messaging.conversations, messaging.sse-realtime, calendar.mobile-views, clubs.courts]
implements: ../../specs-business/mobile/the-app-feels-smooth.business.md
governed_by: []
---

# mobile.interaction-performance

### Intent
The iOS app's hot interactions — typing in a thread, dragging the week day-sheet, coming back
to the app, opening a class — do only the React work they need. PAD-592, from the PAD-571 speed
study (code at 4757c13d9). iOS-only by nature: the web app has no FlatList, no gesture sheet and
no AppState (web's focus refetch is `client.query-cache`, PAD-586, whose shared defaults the
mobile QueryClient also takes).

### Entities
- **READS:** the thread's message pages (react-query cache), `AppState`, the class instance's
  `clubId`
- **WRITES:** nothing on the server

### Rules
1. **A keystroke re-renders the composer, not the list.** The thread screen's draft is state of
   a `Composer` component (`conversation/[id].tsx`); `MessageBubble` is `React.memo`; the list's
   `renderItem` is stable (`useCallback` over a per-message handler cache that reads the screen's
   latest callbacks through a ref), and the reply quote is looked up in a `Map` by id, not a
   linear `find` per row.
2. **One invalidation per incoming message.** For `message_created` the thread screen only
   patches the open conversation's cache (`applyIncomingMessage`, messaging.sse-realtime rule 10)
   and marks it read; the conversation list and the unread count are invalidated once, by the
   tabs layout, which already does so for every `message_*` event.
3. **`inactive → active` is not a return to the app.** `useAppStateFocus` tells react-query's
   `focusManager` the app is focused only when the previous state was `background` (or unknown),
   so Control Centre, Face ID, the app switcher and incoming-call banners do not refetch every
   mounted query; `background → active` still does. `isForegroundReturn(prev, next)` in
   `src/lib/app-state-focus.ts` is the one place that decides.
4. **The week day-sheet drags on the UI thread.** `DaySheet`'s `top` is a Reanimated shared
   value written by the pan worklet; React state (`GridWithSheet.sheetTop`, the bounds, the
   raised flag, Android back) is committed once, on release. `TimeGrid` is `React.memo` with
   stable props, so the commit re-renders the container and not the grid.
5. **Moving between calendar ranges keeps the previous range on screen** (`placeholderData:
   keepPreviousData` on `useCalendarEvents`) instead of a skeleton while the next week or month
   loads.
6. **The class's courts are asked for once.** The courts query of `class/[id].tsx` is enabled
   only when the instance has loaded and names a club (`isCoach && !!instance?.clubId`); it used
   to fire once with no club and again after the load.
7. **Measured, not assumed.** Dev builds log `[render] bubble` and `[render] timegrid` once per
   render of those components; a change to these screens is proved by counting those lines in
   the Metro log on the simulator (twenty keystrokes in a thread; one sheet drag) before and
   after, numbers in the PR body.

### Acceptance Criteria

#### A bubble with unchanged props does not render again
- **Given** a mounted `MessageBubble` with message "Olá", `own: false` and a stable `onReply`
- **When** its parent re-renders with the same props
- **Then** `[render] bubble` is logged no additional time; a changed `onReply` logs it once
  (`message-bubble.memo.test.tsx`)

#### The thread screen leaves the list refetch to the tabs layout
- **Given** the thread screen's `message_created` branch
- **When** it is read as source
- **Then** it calls neither `invalidateMessagesLists` nor `invalidateQueries`, and the tabs
  layout invalidates `["conversations"]` (`thread-screen-wiring.test.ts`)

#### Control Centre does not count as a return
- **Given** the previous AppState was `inactive`
- **When** the next is `active`
- **Then** `isForegroundReturn` is false; from `background` it is true; `inactive` and
  `background` are both "backgrounded" (`app-state-focus.test.ts`)

#### A committed sheet position does not re-render the time grid
- **Given** a mounted week `GridWithSheet` with a laid-out container and its sheet open
- **When** the sheet commits a position 120 pt higher
- **Then** the sheet receives the new `top` and `[render] timegrid` is logged no additional time
  (`GridWithSheet.memo.test.tsx`)

#### The courts query waits for the club
- **Given** the class screen's source
- **When** it is read
- **Then** the courts query's `enabled` is `isCoach && !!instance?.clubId`
  (`thread-screen-wiring.test.ts`)

### Notes
- Rule 7's counts, from the simulator run recorded in PR #TBD's body, are the evidence for rules
  1 and 4; the unit tests pin the mechanism (the memo, the composer, the commit-on-release) so a
  later edit cannot silently undo it.
- Rule 3 is deliberately narrower than the ticket's "consider `staleTime` 60 s": the stale time
  is `client.query-cache`'s (`QUERY_STALE_TIME_MS` in `packages/hooks/src/queryDefaults.ts`,
  PAD-586) and is not set per screen here.
- Not done in PAD-592 (ticket evidence, not in its fix list): `MonthGrid`'s 42 cells,
  `(tabs)/messages` / `(tabs)/players` row memoisation, the presences roster, the whole-day
  overlap query for students, `useAutoInviteEnabled`'s uncached fetch. Each is a follow-up
  ticket if the measurement says it matters.
