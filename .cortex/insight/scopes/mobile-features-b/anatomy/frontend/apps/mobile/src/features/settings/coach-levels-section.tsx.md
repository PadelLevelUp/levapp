---
path: frontend/apps/mobile/src/features/settings/coach-levels-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 315
size_tokens: 2928
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e6f6ff4b964a0240e15fb12cfca0a998f5e4ee038d4d0b674ab5760c486ba127"
---

## Purpose

`CoachLevelsSection` is the coach skill-levels editor, mirroring web's `CoachLevelsSection`. Web reorders levels via HTML5 drag-and-drop; this mobile port uses per-row up/down buttons instead, but both persist identically — `handleSave` re-POSTs the whole array with `displayOrder` derived from list position, so a reorder is a pure array swap on the client. A code comment (PAD-84) explains list position doubles as ranking semantics (first = strongest, matching the notification engine's "one level above" matching logic) that would otherwise be invisible, so the UI adds highest/lowest end markers plus a decorative rail between rows — hidden from the accessibility tree since the markers alone carry the meaning.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `coachLevelApi` (`addCoachLevel` bulk-upsert, `deleteCoachLevel`); `@levelup/hooks`' `useCoachLevels` query plus `queryKeys.coachLevels` for invalidation after add/save/delete.

Used by: `frontend/apps/mobile/src/features/settings/preferences-section.tsx`: renders `<CoachLevelsSection />` conditionally when `isCoach` is true (imported via the `@/features/settings/coach-levels-section` path alias; not captured as a resolved in-scope edge in this scope's L1 data, but visible directly in the import statement).
