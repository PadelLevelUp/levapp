---
path: frontend/apps/mobile/src/components/ui/avatar.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 42
size_tokens: 278
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d7e119d7246e648b76c9f1ce696ec0584f9054a5a78a38729c5004faa332b157"
---

## Purpose

Styled wrapper around `@rn-primitives/avatar`: `Avatar` (a rounded,
clipped 40x40 container), `AvatarImage`, and `AvatarFallback` (rendered
while the image is unavailable, styled via `TextClassContext.Provider` so
its initials text picks up the right size/color/weight without needing an
explicit `Text` className at each call site).

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: `TextClassContext`
  supplies the fallback-initials text styling.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be consumed wherever a player/coach profile image is
shown throughout the app, outside this scope.
