---
path: frontend/apps/web/src/components/players/detail/AddEvaluationSheet.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 246
size_tokens: 2192
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5b0d2b2d56e6add971394af7334e6d7ea5a03e20b801a6b204eb3572c5891e74"
---

## Purpose

A side sheet for recording a player evaluation: a slider per evaluation category (pre-filled from the player's current score, or the midpoint of the category's scale if none exists), plus editable strength/weakness note chips seeded from the player's current notes. Newly-added notes get a negative client-generated id (`-Date.now()`) to distinguish them from persisted ones; `handleSave`'s `hasNewNotes` check uses that sign to decide whether there's anything worth persisting when there are zero evaluation categories (PAD-58 item 3) — otherwise saving with no categories and no new notes would silently no-op while still flashing a success toast.

## Connections

Uses: `@/hooks/use-toast`; `@/api/players` (`deleteCoachNote`, outside this scope) — called directly from the X button on each strength/weakness chip, immediately on click, for BOTH pre-existing and just-added-locally (negative-id) notes; `@/components/ui/sheet`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/label`, `@/components/ui/slider`, `@/components/ui/separator`, `@/components/ui/badge`; `@/types` (`CoachNote`, `EvaluationCategory`, `PlayerEvaluation`).

Used by: a player-detail page (outside this scope), which supplies `categories`, `currentEvaluations`, `currentStrengths`/`currentWeaknesses`, and the `onSave` handler that persists the score/note diff.

Semantically related (not imports): `players/detail/PlayerEvaluations.tsx` — the read-only display counterpart of the scores this sheet edits; `players/detail/PlayerStrengthsWeaknesses.tsx` — a second, separately-implemented strengths/weaknesses editor with its own add/remove flow, distinct from this sheet's.
