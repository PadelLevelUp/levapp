---
id: B-402
title: "A live message_edited dropped the metadata on both shells, so no retired, withdrawn or answered invite bubble changed until a refetch"
type: missing-criterion
severity: high
status: resolved
affects:
  - messaging.sse-realtime
  - notifications.invitations rule 15
  - notifications.invitations rule 19
  - notifications.reminders rule 9
  - frontend/apps/web/src/pages/MessagesPage.tsx
  - frontend/apps/mobile/app/conversation/[id].tsx
related_specs:
  - .specflow/specs/messaging/sse-realtime.spec.md
  - .specflow/specs/notifications/invitations.spec.md
proposed_fix: "Both shells merge content, edited (as sent) and metadata from a message_edited payload, never isRead/status; rule 18 names it. Id unconfirmed (range B-401–420, wave 13)."
opened: 2026-10-09T19:00:00Z
resolved: 2026-10-09T19:20:00Z
---

# B-402: a live `message_edited` dropped the metadata on both shells

**Source:** PAD-563 phase 1 (Session A, wave 13, 2026-10-09), reading the handlers while tracing
why the coach's recorded answer never reached the chat.

**What happened:** web `MessagesPage.tsx` (the `message_edited` branch) and iOS
`conversation/[id].tsx` merged only `content` and forced `edited: true`. Every metadata edit the
backend publishes as `message_edited` — a retired invitation (PAD-499, rule 15), a withdrawn one
(PAD-548, rule 19), a superseded reminder (PAD-49, reminders rule 9) — therefore painted an
"(edited)" marker and changed no badge or button until the conversation was refetched. The
backend tests proved the publish; nothing proved the client applied it.

**What should happen:** the open conversation takes the payload's `content`, `edited` and
`metadata` (`messaging.sse-realtime` rule 18), and keeps `isRead`/`status`, which the viewer-less
payload does not know.

**Root cause:** Type 1, missing criterion. `reminders` rule 9 and `invitations` rules 15/19 say the
bubble updates "without a reload", but no spec named what a client merges from the event and no
test on either shell drove a `message_edited` through the handler.

**Affected specs:**
- Dev: `.specflow/specs/messaging/sse-realtime.spec.md` (new rule 18 + criterion)
- Business: none (the outcome "the student sees the answer at once" was already described)

### Change Plan

Rule 18 + criterion "A metadata edit reaches the open conversation live" (done in PAD-563);
`mergeEditedMessage` on each shell with a unit test; the PAD-563 Playwright pin exercises the live
path end to end.

### Resolution

- Spec changes: `messaging/sse-realtime.spec.md` rule 18 + criterion.
- Tests: web `src/lib/mergeEditedMessage.test.ts`; iOS `features/messages/utils.test.ts`
  (`mergeEditedMessage`); the PAD-563 E2E (live badge without reload).
- Code: web `src/lib/mergeEditedMessage.ts` used by `MessagesPage.tsx`; iOS
  `features/messages/utils.ts` used by `conversation/[id].tsx`.
- Resolved: 2026-10-09 (PR for PAD-563). Reaches three features: PAD-499's retire, PAD-548's
  withdraw and PAD-563's coach answer were all not live before this.
