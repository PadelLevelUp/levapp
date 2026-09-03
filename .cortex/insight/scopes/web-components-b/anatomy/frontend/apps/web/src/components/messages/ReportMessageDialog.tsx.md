---
path: frontend/apps/web/src/components/messages/ReportMessageDialog.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 3
size_lines: 102
size_tokens: 854
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d38029dcafcdf4db55ff7483702f81ff63319cbbcefd0d743b35b11dfa26f9a3"
---

## Purpose

A reason-picker dialog (radio group of `spam`/`harassment`/`inappropriate`/`other`, plus a free-text details field) for flagging a message to moderation, deliberately built as a single reusable component consumed from two different call sites in this scope. Its own doc comment states the design explicitly: reused by both the message-level action menu (flag one specific message) and the chat header's flag entry (flags the most recent message from the other participant).

## Main players

- `ReportMessageDialog` (function component, lines 31–101) — critical, the file's sole export.
- `handleSubmit` (lines 43–57, local) — critical. Builds a combined reason string (`"{label}: {details}"` when details are given, else just the label) and calls `reportMessage(messageId, combinedReason)`; no-ops if `messageId` is null, which happens whenever the caller has nothing to flag yet (e.g. `ChatThread`'s `lastParticipantMessageId` when there is no message from the other participant).
- `REPORT_REASONS` (const array, line 17) — supporting. The closed set of flag reasons; `ReportReason` is its derived literal-union type.
- `resetAndClose` (lines 37–41, local) — supporting. Resets `reason` back to `'spam'` and clears `details` on close, so reopening the dialog for a different message never carries over a stale reason/details draft.

## Insights

- `messageId` is nullable by prop type (`string | null`) specifically to support the chat-header call site, where there may be no eligible message to flag yet; the submit button is disabled whenever it's null (`disabled={submitting || !messageId}`), so the dialog can be opened harmlessly even with nothing selected.
- The combined-reason string sent to the backend is client-composed (`"{translated label}: {free text}"`) — there's no structured `{reason, details}` payload; the API only ever sees one flattened string field.

## Connections

Uses: `@/api/messages` (`reportMessage`, outside this scope); `@/components/ui/dialog`, `@/components/ui/radio-group`, `@/components/ui/label`, `@/components/ui/textarea`, `@/components/ui/button`; `sonner` (`toast`).

Used by: `frontend/apps/web/src/components/messages/ChatThread.tsx` (thread-level flag of the last thing they sent, triggered from `ChatHeader`'s dropdown) and `frontend/apps/web/src/components/messages/MessageBubble.tsx` (per-message flag, triggered from `MessageActionMenu`) — both in this scope, as two entirely independent mounted instances with independent `open` state.

## Query pointers

If you need to change the flag-reasons list or add a new one, edit `REPORT_REASONS` here — both call sites (`ChatThread.tsx`, `MessageBubble.tsx`) automatically pick up the change since they don't own any reason logic themselves.
If a flag isn't submitting, check whether `messageId` is null at the specific call site before assuming this file is broken — the chat-header path can legitimately have no message to flag.
