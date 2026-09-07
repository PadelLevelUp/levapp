---
id: B-027
title: "The conversation thread loads the whole history and snaps back to the bottom while the user reads"
type: incomplete-rule
severity: high
status: open
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/web/src/components/messages/MessageList.tsx
  - backend/padel_app/serializers/conversation.py
proposed_fix: "Give messaging.conversation-detail a paging contract on rule 1 and three new rules (9/10/11) for opening anchored at the newest message, holding a scrolled-up viewport, and prepending older pages without a jump; then paginate the endpoint and rewrite both clients' scroll handling against them."
opened: 2026-09-07T00:00:00Z
---

# B-027 — The conversation thread loads the whole history and snaps back to the bottom while the user reads

**Source:** PAD-208 (human report after TestFlight 1.1.4 / build 8), originally audit finding
H10 (second half) in
`.cortex/archive/documents/data-model-audit-2026-09-02/extracted/findings.md`.

**What happens:** opening a conversation visibly scrolls down "super fast" through every
message ever sent, and scrolling up to read older messages snaps the viewport back to the
bottom.

**What should happen:** the thread opens already positioned at the newest message with no
visible travel, older messages load a page at a time as the user scrolls up with the
viewport anchored where it was, and a viewport that is away from the bottom is never moved
by anything the user did not do.

**Root cause:** Type 2 — incomplete rule. `messaging.conversation-detail` rule 1 says the
endpoint "returns conversation + messages + participants" with no bound, and rule 4 says only
that the frontend "renders as scrollable message list with chat bubbles". Nothing in the spec
says how much of the history is fetched, where the thread opens, or what may move the
viewport — so both the unbounded payload and the unconditional `scrollToEnd` are faithful
implementations of what was written.

**Evidence (Phase 1):**

1. *Payload, read directly.* `serialize_conversation_detail`
   (`backend/padel_app/serializers/conversation.py`) renders
   `sorted(conversation.messages, ...)` — every row of the thread, unconditionally —
   and `get_conversation_for_detail` `selectinload`s the whole `Conversation.messages`
   collection to feed it. `GET /api/app/conversation/<id>` takes no paging argument at all
   (`backend/padel_app/modules/frontend_api.py:553`). PAD-204 made the query cheap; it did
   not make the payload or the client render bounded, so both are still O(history).
2. *The snap, located at the boundary where the viewport is moved.* In
   `frontend/apps/mobile/app/conversation/[id].tsx` the `FlatList` (deliberately
   non-inverted — Fabric hit-testing, comment at ~L430) carries
   `onContentSizeChange={scrollToBottom}` (L753) and `onLayout={scrollToBottom}` (L754),
   where `scrollToBottom` is `listRef.current?.scrollToEnd({ animated: false })` with no
   guard of any kind. `onContentSizeChange` fires once per FlatList render batch, which is
   the visible fast scroll on open, and again on *every* later content-size change — an SSE
   `message_created` appended by `updateConversationCache`, a reaction, an edit, a
   react-query refetch, an image finishing layout, the keyboard opening — each of which
   re-issues `scrollToEnd` regardless of where the user has scrolled. That is the snap.
3. *Why web is the milder case.* `frontend/apps/web/src/components/messages/MessageList.tsx`
   already tracks `nearBottomRef` and only auto-scrolls for the user's own message or when
   the viewport is near the bottom, so web does not snap — but it still renders the entire
   history before its initial `scrollToBottom(false)` and has no way to load older pages,
   because there are none.

**Reproduction:** the payload half is reproduced deterministically as a backend test
(`backend/padel_app/tests/test_pad208_conversation_paging.py`). The iOS scroll half is
**not reproduced on a simulator** — the local simulator hangs on a simctl privacy prompt
(recorded in session memory) — so it rests on the field report plus the code reading in (2),
where the props are unconditional by inspection and there is no other code path that moves
the list.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversation-detail.spec.md`
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/conversation-detail.spec.md`
**Change type:** rewrite rule 1 (paging contract) + add rules 9, 10, 11 + acceptance criteria

**Rewrite rule 1 to:** `GET /api/app/conversation/{id}` accepts `limit` (page size) and
`before` (a message id, exclusive). With `limit` it returns the newest `limit` messages older
than `before` — or the newest page when `before` is absent — still ordered ascending within
the page, plus `hasMore` and `oldestMessageId`. Without `limit` the full history is returned
unchanged, for clients already in the field; that branch is deprecated.

**Add rule 9:** the thread opens anchored at the newest message with no visible scroll
animation; the first page is positioned before the user sees it.

**Add rule 10:** while the viewport is away from the bottom (beyond a small threshold), no
content change moves it — not new incoming messages, edits, reactions, refetches, keyboard or
image loads. A "new messages" affordance appears instead. At the bottom, incoming messages
keep the view pinned; the user's own sent message always scrolls to the bottom.

**Add rule 11:** reaching the top of the loaded messages fetches the previous page and
prepends it with the viewport anchored to the message that was at the top; a loading
indicator shows while fetching; nothing loads when `hasMore` is false.

**Add criteria:** the paging contract (60 seeded messages, `limit=50` → the 50 newest with
`hasMore: true`; `before=<oldest id>` → the remaining 10 with `hasMore: false`); a scrolled-up
viewport is stable when a message arrives; scrolling up loads older messages and keeps the
anchor.

**Business spec:** journey step 2 of
`.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md` promises
"every prior message, in order" — update it to promise the most recent messages, with older
ones loading on scroll and reading never interrupted by arrivals.

**Then:**
1. Coherence check against `messaging.messages`, `messaging.sse-realtime`,
   `messaging.read-tracking` (read state is still resolved per page).
2. pytest for the paging contract — failing first.
3. Playwright specs for the scrolled-up stability and the load-older anchor — failing first.
4. Paginate the endpoint (keeping PAD-204's `selectinload` and PAD-203's `participantDeleted`
   guard), share the paging state in `@levelup/hooks`, then rewrite both clients' scroll
   handling.
5. Regression: backend, unit, tsc, full Playwright suite.

### Resolution

Pending — filled in when the change plan above has been executed.
