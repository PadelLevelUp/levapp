---
path: frontend/apps/mobile/app/(tabs)/presences.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 11
size_tokens: 95
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d758b8b4055810dcc5e4f9bb5ec4653a327d1186374b9c8c7dced931b3b880cf"
---

## Purpose

Thin route wrapper (PAD-140) for the coach's attendance overview: the tab is hidden from students via `_layout.tsx`'s `href: null`, but the guard is UX-only — every endpoint behind the underlying screen re-checks `require_coach()` server-side. All actual logic lives in the imported feature component.

## Connections

Uses:
- `@/features/presences/PresencesScreen`: outside this scope (mobile-components) — this file is a one-line delegate to it.

Used by: no file within this scope.
