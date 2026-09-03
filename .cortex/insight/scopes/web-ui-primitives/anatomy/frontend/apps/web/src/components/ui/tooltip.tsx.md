---
path: frontend/apps/web/src/components/ui/tooltip.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 29
size_tokens: 288
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bd9361649477cf9496f4b48415a2eafb9ae1ebca81af58a29b61b1516adc88c1"
---

## Purpose

Stock shadcn/ui tooltip (`Provider`/`Root`/`Trigger`/`Content`) wrapping Radix Tooltip. Consumed by `sidebar.tsx` for the tooltip shown on menu buttons when the sidebar is collapsed to icon-only.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-tooltip`: full primitive set.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `sidebar.tsx` (L3, same scope) — `SidebarProvider` wraps the whole sidebar in `TooltipProvider`, and `SidebarMenuButton` renders `Tooltip`/`TooltipTrigger`/`TooltipContent` for the collapsed state.
