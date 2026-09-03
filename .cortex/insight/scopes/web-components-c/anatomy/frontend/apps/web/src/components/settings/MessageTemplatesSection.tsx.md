---
path: frontend/apps/web/src/components/settings/MessageTemplatesSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 3
size_lines: 153
size_tokens: 1495
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c112f110aad59815a1c3df6655c9d7f9375e6a892591f6394e82b3f5c8f9a3cf"
---

## Purpose

`MessageTemplatesSection` lets a coach customize the text of every automated notification message the invitation/reminder engine can send (reminders, invitations, waiting-list offers — 10 template keys grouped into 3 sections), with clickable variable-insertion badges (`{name}`, `{level}`, `{weekday}`, `{time}`) that splice a placeholder into the currently-focused textarea at the cursor position. It manages its own local draft state distinct from the parent's `config`, saving directly via its own API call rather than going through the parent's generic `save()` patch helper that every sibling section in `NotificationsEngineSection` uses.

## Main players

- `VARIABLE_HINTS` (lines 14–19) — supporting. Maps only 4 of the 10 template keys (`invite`, `reminder`, `reminder_followup`, `waiting_list_placed`) to their insertable variable badges; the other 6 keys render no variable hints at all.
- `LABEL_KEYS` / `DESCRIPTION_KEYS` (lines 21–45) — supporting. i18n key lookup tables for every one of the 10 `MessageTemplates` keys.
- `GROUPS` (lines 47–60) — critical. Defines the display grouping and order: Reminders (4 keys) → Invitations (4 keys) → Waiting List (2 keys) — the only place the flat `MessageTemplates` type is organized into a UI hierarchy.
- `MessageTemplatesSection` (lines 67–152) — critical. Owns `local` (the draft, seeded from the `templates` prop, not resynced if the prop changes after mount) and `textareaRefs` (a ref-per-template-key map used by `insertVariable` to splice text at the live cursor position and restore focus/selection after the state update via `requestAnimationFrame`).

## Insights

This is the only section under `NotificationsEngineSection` that manages its own save button and calls `updateNotificationConfig` directly instead of routing through the parent's `save(patch)` helper — every sibling (Reminders, Eligibility, Invitation Groups, Tiebreakers, Restrictions) instead calls `onChange` and lets the parent persist. On success it also calls `onChange(local)` to sync the parent's `config.messageTemplates`, but the parent's own `onChange` handler for this section (`setConfig(prev => ...)`) updates local React state only and does **not** call the API — so the actual persistence happens once, inside this component, not in the parent. `isDirty` is computed via `JSON.stringify` comparison against the prop on every render rather than a dirty flag, which is fine at this scale (10 short strings) but wouldn't scale to a larger template set. `local` state is seeded once from `templates` via `useState(templates)` with no effect to resync if the prop changes externally after mount — if the parent's `config` is refetched or reset while this section is open, the draft would go stale.

## Connections

Uses:
- `@/api/notificationEngine` (`updateNotificationConfig`): called directly by this section's own Save button, bypassing the parent `NotificationsEngineSection`'s `save()` patch-and-revert helper that its sibling sections use.
- `@/types` (`MessageTemplates`).
- `@/components/ui/{button,textarea,label,badge}`.
- `sonner` (`toast`): direct success/error toast, unlike sibling sections which rely on the parent's silent-revert-on-failure pattern with no toast at all.

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Message Templates" collapsible, one of the two collapsibles (with "Notify Groups") never gated behind the `autoNotifyEnabled` master switch — templates apply to both automatic and manual-mode messages.

## Query pointers

If you add a new message template key, update `MessageTemplates` in `@/types`, then `LABEL_KEYS`/`DESCRIPTION_KEYS`/`GROUPS` here, and consider whether it needs a `VARIABLE_HINTS` entry — 6 of the 10 existing keys currently have none, so omitting it is not an oversight, just check which behavior you want.
If templates appear to save but the parent's displayed config looks unchanged elsewhere in the page, check this file's `handleSave`/`onChange` split against `NotificationsEngineSection.tsx`'s `messageTemplates` `onChange` handler — persistence happens here, not in the parent's normal `save()` path.
