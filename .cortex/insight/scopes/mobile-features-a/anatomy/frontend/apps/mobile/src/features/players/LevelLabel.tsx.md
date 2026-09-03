---
path: frontend/apps/mobile/src/features/players/LevelLabel.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 33
size_tokens: 262
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e33d18104c754e01f2d0eb2992e5717c72cbb57bdd27391484cb9879a6de35c9"
---

## Purpose

Small level-code + label display component (bold code, muted "|" separator, muted label — e.g. "B1 | Beginner"), plus a plain-string variant `levelOptionLabel` for use as a Select option's text label where a component can't be rendered. Mobile port of the web `LevelLabel` (PAD-14): keeps the short code visually distinct from the human-readable name.

## Connections

Uses:
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `cn`.

Used by:
- `frontend/apps/mobile/src/features/players/PlayerForm.tsx` (in scope): `levelOptionLabel`, used to build the label strings for the level `Select`'s options.
