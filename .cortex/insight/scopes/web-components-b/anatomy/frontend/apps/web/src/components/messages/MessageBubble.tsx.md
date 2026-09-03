---
path: frontend/apps/web/src/components/messages/MessageBubble.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 3
size_lines: 444
size_tokens: 5116
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "157c237906a4ab9eb429562add1ca0a2797e0f48c02d9a47044ab96aee37f572"
---

## Purpose

The single-message bubble — the densest component in this scope. Beyond plain text rendering (with reply-preview, edited/timestamp/read-status footer, reactions, and swipe-to-reply via framer-motion drag), it is also where THREE different notification-message types render their own inline response UI directly in the bubble: `notification_invite` (yes/no seat invite), `notification_reminder` (yes/no attendance confirmation, with a late-cancellation confirm step, PAD-46/49/68), and `replacement_approval` (delegates to `ReplacementApprovalCard`). A deleted message (`message.isDeleted`) short-circuits to a minimal italic placeholder bubble before any of this renders.

## Main players

- `MessageBubble` (function component, lines 42–443) — critical, the file's sole export besides two small helpers. Owns local UI state for the action menu, report dialog, in-flight "responding" flag, and a locally-optimistic response override (`localResponse`) that lets the UI update before the server round-trip completes.
- `StatusIcon` (lines 31–40) — supporting, exported. Maps a `MessageStatus` (`sending`/`sent`/`delivered`/`read`/`failed`) to a small lucide icon; only rendered for the viewer's own (`isMine`) messages.
- `formatTime` (lines 12–14) — supporting, exported. Locale-aware `toLocaleTimeString` wrapper for the message footer.
- `handleRespond` / `handleRespondReminder` / `handleCancelAttendance` (lines 65–118, local closures) — critical. Three near-parallel async handlers, each hitting a different `@/api/notificationEngine` endpoint (`respondToNotification`, `respondToReminder`, `cancelAttendance`) and setting `localResponse` optimistically; `handleRespondReminder` additionally handles a server `"expired"` action by toasting and returning without touching `localResponse` (PAD-68: never paint a confirmed/absent badge for an answer the backend didn't record).
- Reminder response derivation (inline IIFE, lines 297–400) — critical. Computes `confirmed`/`declined`/`superseded`/`isLateCancellation` purely from `message.metadata` plus `Date.now()` at render time — no state is stored for "is this reminder still actionable"; a reminder ages out of actionability automatically once its class's `startsAt` passes, with no data migration needed for old reminders.

## Insights

- This file renders its OWN `ReportMessageDialog` instance (lines 435–439), independent of the one `ChatThread.tsx` renders at the thread level — see `ChatThread.tsx`'s Insights for the two-mount-point rationale. A bug fix to one report flow does not automatically apply to the other.
- The long-press/right-click menu-open coordinate handling (`handleTouchStart`/`handleTouchEnd`, `onContextMenu`) lives here, not in `MessageActionMenu.tsx` — this file computes WHERE to open the menu (touch point or right-click point), `MessageActionMenu.tsx` only clamps that point to the viewport once told.
- PAD-46/49/68 layer three independent "this reminder/response is no longer actionable" conditions on top of each other: `superseded` (an explicit backend flag, PAD-49, when a newer reminder replaces this one), `!classInFuture` (PAD-68, derived from `startsAt` — expired reminders retire themselves with no migration), and `isLateCancellation` (PAD-46, derived from `cancellationDeadline`, gates a confirm-step rather than blocking the cancel outright). Missing `cancellationDeadline` on older reminders silently means "no late-cancellation warning" rather than an error.
- Reaction rendering deduplicates emoji via `Array.from(new Set(...))` and counts occurrences separately per emoji — reactions are a flat array of `{emoji, ...}`, not pre-grouped by the API.
- The invite/reminder response areas are structurally almost identical accepted/declined/pending state machines to `ActionButtons.tsx`, but this file reimplements the pattern inline rather than reusing that component (see `ActionButtons.tsx`'s Connections).

## Connections

Uses: `./MessageActionMenu`, `./ReportMessageDialog` (in this scope); `@/components/notifications/ReplacementApprovalCard` (in this scope) for the `replacement_approval` message type; `@/api/notificationEngine` (`respondToNotification`, `respondToReminder`, `cancelAttendance`, outside this scope); `@/types` (`ApprovalBundle`, `Message`, `MessageStatus`); `framer-motion` (drag gesture + swipe-to-reply); `sonner` (`toast`).

Used by: `frontend/apps/web/src/components/messages/MessageList.tsx` (in this scope) renders one `MessageBubble` per message in the thread.

Semantically related (not imports): `messages/ActionButtons.tsx` — parallel but unreused accept/decline UI pattern (see Insights); `notifications/ReplacementApprovalCard.tsx` — the third notification-message type this file delegates to rather than inlining, unlike the other two.

## Query pointers

If you need to change how a specific notification-message type's inline response UI behaves, find its block by `message.messageType` (`notification_invite`, `notification_reminder`, or `replacement_approval`) — the three are independent code paths, not a shared abstraction.
If you need to change the message-report flow, check whether you need to change this file's own dialog mount, `ChatThread.tsx`'s separate mount, or both — see this file's Insights and `ChatThread.tsx`'s Insights.
If you need swipe-to-reply or long-press-menu gesture behavior, this file owns both; `MessageActionMenu.tsx` only renders/positions the menu once opened.
