---
id: B-563
title: "iOS: a chat keystroke re-rendered every bubble, the week sheet re-rendered the grid per drag frame, Control Centre refetched every tab query, each message invalidated the lists twice"
type: missing-dev-spec
severity: medium
status: triaged
affects:
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/messages/components/message-bubble.tsx
  - frontend/apps/mobile/src/hooks/useAppStateFocus.ts
  - frontend/apps/mobile/src/features/calendar/DaySheet.tsx
  - frontend/apps/mobile/src/features/calendar/TimeGrid.tsx
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "New leaf mobile.interaction-performance (rules 1–7): composer component + memoised bubble + stable renderItem; one SSE invalidation (tabs layout); inactive→active is not a focus event; sheet drag on a shared value over a memoised grid; keepPreviousData on calendar ranges; courts query gated on clubId; dev render counters for the measurement."
opened: 2026-10-10T02:40:00Z
---

# B-563: iOS hot interactions re-render what did not change

> Ledger id **unconfirmed** (wave-14 range B-561–580; B-561/B-562 are on sibling branches, so
> this index line sits after B-463 here).

**Source:** PAD-592, filed by the PAD-571 speed study (code at 4757c13d9).

**What happens:** on the thread screen the composer's draft is state of the 1,736-line screen
component that also owns the `FlatList`; `renderItem` is an inline closure and `MessageBubble`
is not memoised, so every keystroke re-renders every mounted bubble (and resolves the reply
quote with a linear `find` per row). An incoming message invalidates the conversation list and
the unread count twice (the screen and the tabs layout). `useAppStateFocus` sets react-query's
focus on every `active` transition, including `inactive → active` (Control Centre, Face ID, the
app switcher), so every mounted tab query refetches. On the week view `DaySheet` pushes the
pan's position into React state per frame and the unmemoised `TimeGrid` re-lays out every
column each frame. The class screen's courts query fires once with no club and again after the
instance loads.

**What should happen:** `mobile.interaction-performance` rules 1–6.

**Evidence (Phase 1):** code at c0d345720 read against the ticket's line references (all still
true at that SHA). Reproduced on the harness: `GridWithSheet.memo.test.tsx` counts one extra
`[render] timegrid` per committed sheet position without the memo (4 vs 3);
`message-bubble.memo.test.tsx` counts an extra `[render] bubble` on a same-props parent re-render
without the memo (2 vs 1); `thread-screen-wiring.test.ts` is red on the staging sources for the
double invalidation, the in-screen draft and the ungated courts query. Simulator render counts
before/after (rule 7) are in the PR body. No spec governed any of this — Type 4.

**Affected specs:** new `mobile.interaction-performance` and
`mobile.the-app-feels-smooth`; `messaging.sse-realtime` rule 10 and `calendar.mobile-views`
are unchanged (their behaviour is kept; only how often React runs changed).

### Change Plan
- Draft the leaf and its outcome (done in this branch) with the seven rules above.
- Tests red first: `app-state-focus.test.ts`, `GridWithSheet.memo.test.tsx`,
  `message-bubble.memo.test.tsx`, `thread-screen-wiring.test.ts`.
- Code: `Composer` component, `React.memo(MessageBubble)` + `rowHandlersFor` cache +
  `messagesById` Map, SSE handler keeps the cache patch only, `isForegroundReturn`, DaySheet
  shared value + `TimeGrid` memo, `keepPreviousData`, courts `enabled` gate.
- Out of this ticket (ticket evidence, not its fix list): MonthGrid cells, list-row memoisation,
  the presences roster, the student overlap query, `useAutoInviteEnabled` — follow-ups if
  measured.

### Resolution

(filled in when the PR lands)
