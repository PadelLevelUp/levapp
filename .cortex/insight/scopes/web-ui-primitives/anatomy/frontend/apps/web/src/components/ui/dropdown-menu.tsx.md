---
path: frontend/apps/web/src/components/ui/dropdown-menu.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 180
size_tokens: 1815
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b1ede0a4144b64853dc7ba62d184c09df479482eada86f936ce5b3d0b67a9a19"
---

## Purpose

Dropdown menu (`Sub`/`Content`/`Item`/`CheckboxItem`/`RadioItem`/`Label`/`Separator`/`Shortcut`) wrapping Radix DropdownMenu. Stock shadcn/ui structure, same shape as `context-menu.tsx` and `menubar.tsx`.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-dropdown-menu`: full primitive set.
- `lucide-react`: `Check`/`ChevronRight`/`Circle` icons.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `context-menu.tsx`, `menubar.tsx` — near-identical structure and styling.
