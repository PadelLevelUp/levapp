---
path: frontend/apps/web/src/components/settings/RestrictionsPanel.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 400
size_tokens: 3642
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d82ccfad57546c9d2ae71f99ded445b5fe61f9d1ced5ad59fb89ce46fd79c1c5"
---

## Purpose

`RestrictionsPanel` is the notification engine's guard-rail panel: a set of independently toggleable, steppable limits (max simultaneous invites, max total invites, max inactive time, min time before class, max invites per student per day, quiet hours, excluded players, exclude-unpaid-subscription) plus one always-on scalar (cancellation deadline hours, PAD-45). Two internal row components carry the two shapes: `RestrictionRow` (toggle + optional stepper) and `ScalarStepperRow` (stepper only, no toggle, used solely for the cancellation deadline). `ExcludedPlayersRow` is the one row with real async behavior — a 300ms-debounced player search (`searchPlayers`) with a dropdown of results, rendering names from a locally-accumulated `playerNames` map since the persisted restriction only stores player ids.

## Connections

Uses:
- `@/api/notificationEngine` (`searchPlayers`): player search for the excluded-players picker.
- `@/components/ui/{switch,button,badge,input}`.
- `@/types` (`NotificationRestrictions`).

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it in the "Restrictions" collapsible, merging hardcoded defaults with `config.restrictions` (covering configs saved before newer restriction fields existed) and disabling it when `autoNotifyEnabled` is off.

Semantically related (not imports): the same 300ms-debounced `searchPlayers` pattern (with an identical `setTimeout`+`clearTimeout` ref) is duplicated independently in `StandingWaitingListSection.tsx`.
