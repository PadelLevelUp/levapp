---
path: frontend/apps/mobile/src/lib/utils.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 7
size_tokens: 42
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d1f1e0d62cb8d8d1e04c26e14de842d8a151f75812d81b046c65b5d1fe8e4b27"
---

## Purpose

The standard `cn()` classname helper (`clsx` + `tailwind-merge`), the mobile equivalent of the same utility conventionally found in shadcn/react-native-reusables-based projects — used throughout `app/` for conditional NativeWind class composition.

## Connections

Uses: none within scope (`clsx`, `tailwind-merge`: outside this scope, third-party).

Used by: no in-scope file is captured in L1's structural edges (the `@/lib/utils` alias goes unresolved), but by direct reading `cn()` is imported by `app/(tabs)/calendar.tsx`, `app/(tabs)/players.tsx`, `app/class/[id].tsx`, `app/class/new.tsx`, and `app/event/new.tsx`, wherever conditional class composition (e.g. selected-state color swatches, FAB positioning) is needed.
