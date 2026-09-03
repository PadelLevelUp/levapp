---
path: frontend/apps/web/src/components/settings/RemindersSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 208
size_tokens: 2227
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "970e2459e9bda8b8422b5447787c87d2d0c9f1a88ae17077a9b042ee058d4977"
---

## Purpose

`RemindersSection` configures the notification engine's class reminder timing: when the first reminder fires (either "N hours before" or "N days before at HH:MM", via the inner `TimingSelector`), how many follow-up reminders are sent and how many hours apart, and when invitations for the class should start going out. Each `ReminderTiming` field is a discriminated union (`hours_before` | `days_before_at_time`) and `TimingSelector` switches between the two modes, defaulting to sane values (48h, or day 2 at 17:00) when toggling into a mode with no prior value for that shape.

## Connections

Uses:
- `@/components/ui/{button,select}`.
- `@/types` (`ReminderConfig`, `ReminderTiming`).

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Reminders" collapsible, merging a set of hardcoded defaults with `config.reminderTiming` before passing it down, and disabling it when the master `autoNotifyEnabled` switch is off.

Semantically related (not imports): exports the reusable `TimingSelector` sub-component but it isn't imported anywhere else in this scope — the identical "hours before / days before at time" shape is not reused by `RestrictionsPanel`'s steppers, which are built independently.
