---
path: frontend/apps/web/src/components/notifications/ReplacementApprovalCard.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 232
size_tokens: 2265
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "13c7e7559cdaa349aa055e2a1d718c0d46fb00797803d22c1449878444906e4e"
---

## Purpose

Renders inside a `replacement_approval`-type message bubble: for each vacancy created by a declined player, shows who declined, who (if anyone) was auto-added from the waiting list, and the ordered invite queue of remaining candidates (each tagged with their round/group). The coach responds once per bundle — "yes, right now" (`yes_now`), "yes, at window open" (`yes_at_window`, only offered when `windowOpenAt` is still in the future), or "no" (`dismiss`) — via `respondToApproval`. A vacancy can independently go `stale` (someone else filled it, or it expired) while the coach is still deciding; if ALL vacancies in the bundle go stale, the whole card collapses to a single "no longer needed" badge instead of showing action buttons.

## Connections

Uses: `@/api/notificationEngine` (`respondToApproval`, outside this scope); `@/types` (`ApprovalAction`, `ApprovalBundle`, `ApprovalVacancyResult`); `sonner` (`toast`).

Used by: `frontend/apps/web/src/components/messages/MessageBubble.tsx` (in this scope), passed `bundle={approvalBundle}` and `readOnly={isMine}` — a coach viewing their OWN sent approval-request message sees it without action buttons.

Semantically related (not imports): `messages/MessageBubble.tsx` — this card is one of three notification-message inline-response UIs that file renders (the other two, invite and reminder responses, are implemented directly inline in `MessageBubble.tsx` rather than factored out like this one).
