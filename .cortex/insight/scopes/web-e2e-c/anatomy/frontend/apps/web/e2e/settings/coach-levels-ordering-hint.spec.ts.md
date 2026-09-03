---
path: frontend/apps/web/e2e/settings/coach-levels-ordering-hint.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 113
size_tokens: 1289
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "889d3c29bff45ba97cdc61c4d7302b765be3139de61f152ed9f08d8830543adb"
---

## Purpose

PAD-84: the "Coach Levels" reorder list in Settings > Preferences gave no clue
which end is the strongest level. Pins the deliberately small fix: a "Highest"
marker on the first row, a "Lowest" marker on the last, and a decorative
top-to-bottom arrow between them (marked `aria-hidden` since the two text
markers already carry the meaning). Also verifies the markers track the
rendered list index (not the saved `displayOrder`) through a live drag
reorder, and pins the ABSENCE of two earlier, cut attempts at the same cue — an
explanatory paragraph and a per-row numeric rank — so they don't creep back in.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): the ordering convention itself ("lower
displayOrder = stronger level") is specs/levels/spec.md rule 3 (PAD-70) and is
consumed by the backend's `notification_service._level_ids_one_above`;
component: CoachLevelsSection (Settings > Preferences tab). No draft/save is
persisted by this spec, so seeded levels are left untouched.
