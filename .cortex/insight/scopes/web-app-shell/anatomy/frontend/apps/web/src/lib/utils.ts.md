---
path: frontend/apps/web/src/lib/utils.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 7
size_tokens: 42
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d1f1e0d62cb8d8d1e04c26e14de842d8a151f75812d81b046c65b5d1fe8e4b27"
---

## Purpose

The standard shadcn/ui `cn` helper: composes class names with `clsx` then dedupes conflicting Tailwind utility classes with `tailwind-merge`. Used throughout the web app wherever conditional Tailwind classes are built.

## Connections

Uses: `clsx`, `tailwind-merge` (both external).

Used by: `frontend/apps/web/src/pages/AvailabilityPage.tsx`, `frontend/apps/web/src/pages/LandingPage.tsx`, `frontend/apps/web/src/pages/SettingsPage.tsx` (all this scope, per resolved imports `@/lib/utils`); also almost certainly by shadcn `@/components/ui/*` primitives outside this scope, not confirmed by a resolved import in this slice.
