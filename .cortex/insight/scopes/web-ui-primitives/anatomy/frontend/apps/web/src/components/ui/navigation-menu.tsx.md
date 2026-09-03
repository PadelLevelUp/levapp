---
path: frontend/apps/web/src/components/ui/navigation-menu.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 121
size_tokens: 1257
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "92736fbbe66e31d1b981d10436f9048c76f4b91d8b89e93b679ef2eb54204770"
---

## Purpose

Stock shadcn/ui navigation menu — top-level nav with animated dropdown content panels and a shared sliding viewport/indicator — wrapping Radix NavigationMenu. Exports `navigationMenuTriggerStyle` (a `cva` style, not a component) for reuse by nav-styled links elsewhere in the app.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-navigation-menu`: full primitive set.
- `class-variance-authority`: `cva`, for `navigationMenuTriggerStyle`.
- `lucide-react`: `ChevronDown` icon on triggers.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
