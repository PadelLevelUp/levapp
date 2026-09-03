---
path: frontend/apps/web/src/components/settings/CoachLevelsSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 280
size_tokens: 2717
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4b8f5f1d5f2ec2daed5af5a4a305f167dcb704024683457ea96ae9ef62abb888"
---

## Purpose

`CoachLevelsSection` lets a coach define and reorder their custom level ladder (short `code` + display `label` per level), which other sections (eligibility rules, invitation groups, exercise level-tagging) read against. Rows are drag-and-drop reorderable, and **the list order is semantically load-bearing**: position 1 (lowest `displayOrder`) is the highest/strongest level, consumed by the notification engine's "one level above" matching (PAD-84) — the UI marks this explicitly with "highest level"/"lowest level" end labels and a directional chevron, visible only when there are 2+ rows. Saving re-keys local rows from the server response rather than trusting client-side temp ids, because the upsert endpoint doesn't echo ids back (PAD-101) and reusing a stale `new-…` id on a subsequent delete would send a non-numeric id to the delete endpoint.

## Connections

Uses:
- `@/api/coachLevel` (`getCoachLevels`, `addCoachLevel`, `deleteCoachLevel`): load/upsert/delete the ladder.
- `@/config` (`USE_MOCK_DATA`): short-circuits save to a toast-only mock path.
- `@/components/ui/{card,button,input,separator}`, `@/hooks/use-toast`: layout and feedback.
- `@/types` (`CoachLevel`).

Used by: not observed within this scope (Settings page); the **"position 1 = highest level" convention** it establishes is read by `EligibilitySection`'s and `InvitationGroupsSection`'s level operations (`same_as_class`, `one_above_vacancy`, etc.) and by `training/ExerciseFormSheet.tsx`'s level tagging, all outside this file's own import graph.
