---
path: frontend/apps/web/src/components/messages/MessageList.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 3
size_lines: 177
size_tokens: 1619
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3ac9a2e092cab680c665af48019b19fc14ab1e389d8b734c9413172ab27546c4"
---

## Purpose

The scrollable message feed: groups messages into date sections with a sticky-feeling date separator, renders one `MessageBubble` per message (computing `showTail` — whether to show the sender avatar/tail — by comparing to the previous message's sender), and manages auto-scroll behavior (scroll to bottom on mount, on the viewer's own new message, or on someone else's new message only while already near the bottom) plus a scroll-to-message-by-id jump (used when a bubble's reply-preview is clicked) that highlights the target briefly.

## Main players

- `MessageList` (function component, lines 29–176) — critical, the file's main export. Owns all scroll-related refs and the highlight timer.
- `formatDateSeparator` (lines 8–17, exported) — supporting. Returns "Today"/"Yesterday" (i18n) or a localized weekday+month+day string for any other date.
- `scrollToMessage` (`useCallback`, lines 50–58, local) — critical. Queries `[data-msg-id="${msgId}"]` in the DOM, scrolls it into view, and sets/clears `highlightedMessageId` on a 900ms timer — this is the mechanism `MessageBubble`'s reply-preview click (`onScrollToMessage`) drives.
- Auto-scroll effect (lines 60–79) — critical. On first render, jumps to bottom without animation (`scrollToBottom(false)`) to avoid a visible scroll-in on initial load; on subsequent message-list changes, only auto-scrolls if the new last message is the viewer's own OR the viewer was already near the bottom (`nearBottomRef`) — otherwise a message from someone else while the viewer has scrolled up to read history does not yank them back down.
- `isNearBottom` (lines 40–44) — supporting. Threshold of 100px from the bottom of `scrollHeight`.

## Insights

- The "near bottom" heuristic (`nearBottomRef`, a ref rather than state, updated on every scroll event) is what prevents new incoming messages from someone else from hijacking the scroll position of a viewer reading older history — but a message from the viewer's OWN device always force-scrolls regardless of position, since presumably they just sent it and expect to see it land.
- `scrollToMessage`'s highlight is a plain `setTimeout`, cleared both on next call and on unmount (a cleanup effect at lines 81–85) — there's no debounce, so clicking a second reply-preview while the first highlight is still fading resets the timer cleanly rather than stacking two.
- Date-section boundaries are computed by comparing the FORMATTED label (`formatDateSeparator` output), not the raw date — two consecutive messages on different calendar days that both happen to format to the same label (not possible with the current Today/Yesterday/weekday scheme, but a latent coupling) would silently merge into one section.

## Connections

Uses: `./MessageBubble` (in this scope).

Used by: `frontend/apps/web/src/components/messages/ChatThread.tsx` (in this scope), which supplies the raw `messages` array plus reply/edit/delete/reaction callbacks that pass straight through to each `MessageBubble`.

Semantically related (not imports): none beyond its direct parent/child (`ChatThread.tsx`, `MessageBubble.tsx`).

## Query pointers

If you need to change auto-scroll behavior (when the feed jumps to the bottom vs. stays put), read the effect at lines 60–79 first — it's the single place that decides.
If you need to change what "scroll to and highlight a message" does (used by reply-preview taps), read `scrollToMessage` here; the trigger itself lives in `MessageBubble.tsx`'s reply-preview `onClick`.
