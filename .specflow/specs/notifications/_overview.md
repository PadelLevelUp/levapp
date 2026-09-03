# notifications — Notification Engine

## What this is

The notifications domain.

## What it covers

- `notifications.config` — implemented
- `notifications.reminders` — implemented
- `notifications.invitations` — implemented
- `notifications.semi-auto-approval` — draft
- `notifications.manual` — implemented
- `notifications.waiting-list` — implemented
- `notifications.activity` — implemented
- `notifications.toggle-class` — implemented
- `notifications.class-reminders-manual` — implemented
- `notifications.groups` — implemented
- `notifications.message-templates` — implemented
- `notifications.student-block-preferences` — implemented

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/notifications/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
