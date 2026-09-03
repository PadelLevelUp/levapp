---
path: frontend/apps/web/e2e/settings/temp-id-delete-after-save.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 98
size_tokens: 1180
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fd0147bdbf87dbd7c03d5cc8ef478f39815c0f33006f3e0b3dbf59176293dfef"
---

## Purpose

PAD-101: newly-added, not-yet-persisted rows are keyed with a temporary client
id (coach levels: `"new-<Date.now()>"`; strengths/weaknesses:
`-Date.now()`). After a successful save the component kept the temp id
instead of adopting the server's real numeric id, so deleting a just-added row
before any reload sent the bogus id to the delete endpoint, which either
500'd (backend `int(...)` on a coach-level id) or 404'd (a fake negative note
id) — either way the delete silently failed. Pins the fix at the network
level: the delete request for a just-saved coach level, and separately for a
just-added player strength, must come back 2xx — a DOM-only "row disappeared"
assertion could pass on a wrong optimistic-UI fix while the server still
rejected the call.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`, `openPlayers`

Used by: —

Semantically related (not imports): CoachLevelsSection (Settings >
Preferences) and PlayerStrengthsWeaknesses (Player detail page), and the
`delete/coach_level` / `add_coach_note` / `delete/coach_note` routes.
