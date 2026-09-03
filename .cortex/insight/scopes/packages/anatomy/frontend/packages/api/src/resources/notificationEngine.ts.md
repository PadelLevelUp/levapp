---
path: frontend/packages/api/src/resources/notificationEngine.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 192
size_tokens: 1645
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "18a53b090d6b30a6dce7252434d2a23a368fde60f33748a205e715fd8e90dc59"
---

## Purpose

The largest resource module: the class-invitation/notification engine's client surface — config CRUD, per-class notification toggling, sending reminders/manual notifications, availability-conflict pre-checks, activity log, notification-group lookup, every student/coach response path (respond to invite, respond to reminder including a terminal `"expired"` outcome, cancel attendance with a server-classified `proactive` flag, approve a semi-automatic replacement), message-template updates, and the standing waiting list. `BlockedStudent` documents a PAD-107/PAD-112 merge history: two independently-introduced reasons a student is skipped (self-marked unavailable vs. opted out of invitations) that must be split on the `cause` field, never on whether `reason` is empty.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for the dozen+ `/app/notify/*` endpoints.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `ApprovalAction`, `ApprovalVacancyResult`, `NotificationConfig`, `NotificationEventItem`, `StudentGroup`, `MessageTemplates`, `StandingWaitingListEntry`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `notificationEngineApi`.
- `frontend/packages/hooks/src/useAutoInviteEnabled.ts`: calls `getNotificationConfig` directly (not through `queries.ts`).
