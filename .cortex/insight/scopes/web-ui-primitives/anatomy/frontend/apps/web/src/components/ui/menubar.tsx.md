---
path: frontend/apps/web/src/components/ui/menubar.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 208
size_tokens: 1965
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9a44756ba91e4c486b30574910b72f58c136c7a9281ccf0c13bf366962c7cdaf"
---

## Purpose

Desktop-style menu bar (`Menubar`/`Trigger`/`Content`/`Item`/`CheckboxItem`/`RadioItem`/`Label`/`Separator`/`Shortcut`) wrapping Radix Menubar. Stock shadcn/ui structure, same shape as `context-menu.tsx`/`dropdown-menu.tsx`; a desktop-oriented pattern unlikely to be used on this app's mobile-first surfaces.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-menubar`: full primitive set.
- `lucide-react`: `Check`/`ChevronRight`/`Circle` icons.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `context-menu.tsx`, `dropdown-menu.tsx` — near-identical structure and styling.
