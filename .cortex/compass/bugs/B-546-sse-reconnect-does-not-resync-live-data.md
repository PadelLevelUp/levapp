---
id: B-546
title: "After an SSE reconnect, events published while the stream was down never reached the client; the screen caught up only at its next refetch (up to the one-minute stale window)"
type: incomplete-rule
severity: low
status: triaged
affects:
  - .specflow/specs/messaging/sse-realtime.spec.md
  - frontend/packages/api/src/sse.ts
  - frontend/packages/hooks/src/requestEvents.ts
  - frontend/apps/web/src/components/layout/AppLayout.tsx
  - frontend/apps/mobile/app/(tabs)/_layout.tsx
proposed_fix: "The hub delivers a local, throttled `resync` on every re-open after the first; both shells answer it with one shared invalidation of the live queries."
opened: 2026-10-11T17:10:00Z
---

# B-546: an SSE reconnect did not resync live data

> Ledger id **unconfirmed** (wave-14 Session C range; B-543–545 sit on unmerged branches, so this
> index line goes after B-542 here).

**Source:** PAD-616, found while building PAD-588 (zero-downtime deploys).

**Evidence (Phase 1):** `createSseHub` (`packages/api/src/sse.ts`) re-opens with back-off but the
`open` listener only resets the back-off — nothing tells the listeners the stream was down. The
data-layer reproduction (`liveResync.integration.test.ts`) — stream open, drop, the server's unread
count changes, retry opens the stream — leaves the on-screen unread query at 0: red against a hub
without the resync (mutant), green with it. With the cache policy's 60 s stale window
(`client.query-cache` rule 1) nothing else refetches it.

**Root cause (tree):** `messaging.sse-realtime` rule 16 owns reconnection but says nothing about the
events missed in between; `client.query-cache` rule 4 makes freshness event-driven, so a lost event
is a stale screen. First NO at the rule node → **Type 2, incomplete rule**.

### Change Plan
`messaging.sse-realtime` rule 19 + three criteria; hub `resync` (first open excluded, 5 s throttle
with one trailing resync, forgotten on `close()`); `resyncLiveData` + `answerResync` in
`@levelup/hooks`; web `AppLayout` and the iOS tabs layout call it first. Tests: hub, shared
resync (real QueryClient: on-screen refetch, the rest stale), integration, both handlers; a
Playwright check (stream killed, a message sent, the badge updates without navigation).

### Resolution

_pending_
