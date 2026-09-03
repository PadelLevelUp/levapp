---
path: frontend/apps/web/src/components/ui/context-menu.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 179
size_tokens: 1797
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2d294c5e421c41b817f1644f2d54bfdde628cffae2682e69ca504ae754739ad6"
---

## Purpose

Right-click context menu (`Sub`/`Content`/`Item`/`CheckboxItem`/`RadioItem`/`Label`/`Separator`) wrapping Radix ContextMenu. Stock shadcn/ui structure — same shape as `dropdown-menu.tsx` and `menubar.tsx`, no LevApp-specific styling beyond shared theme tokens.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-context-menu`: full primitive set (`Root`/`Trigger`/`Sub`/`Content`/`Item`/etc.).
- `lucide-react`: `Check`/`ChevronRight`/`Circle` icons for checkbox/submenu/radio indicators.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `dropdown-menu.tsx`, `menubar.tsx` — near-identical structure and styling; all three wrap a different Radix menu primitive with the same item/checkbox/radio/separator visual language.
