---
path: frontend/apps/web/src/components/ui/button.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 55
size_tokens: 574
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5273f22ab40b87df074af2fc6f168f8e35f323c01594549b17f16e391a72efa9"
---

## Purpose

The core Button primitive: `cva` variants (`default`/`destructive`/`outline`/`secondary`/`ghost`/`link`) crossed with sizes (`default`/`sm`/`lg`/`icon`), plus `asChild` support via Radix `Slot`. Explicit LevApp design-system rules are documented inline: hover/active states **darken** via `brightness-95`/`brightness-90` rather than opacity fades — the comment states the system forbids opacity fades because they wash the label out along with the background — and disabled state uses solid `bg-muted`/`text-muted-foreground` rather than a dimmed variant. Heights (`h-11` default / `h-9` sm / `h-12` lg) and the 3px `ring-ring/40` focus ring are LevApp-specific tokens, diverging from shadcn/ui's stock `h-10`/`h-9`/`h-11` and 2px ring. Exports `buttonVariants` so other primitives can apply button styling to non-`<button>` elements.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-slot`: `Slot`, backing the `asChild` prop.
- `class-variance-authority`: `cva` for the variant × size matrix.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `card.tsx`, `badge.tsx`, `toast.tsx`, `occupancy-bar.tsx` — share the same documented "brightness not opacity", radius-by-role, and status-color conventions; see the `levapp-visual-design-conventions` concept, grounded in `frontend/packages/config/src/tokens.ts`.
- `alert-dialog.tsx`, `calendar.tsx`, `carousel.tsx`, `pagination.tsx` — all import `buttonVariants` to apply this file's exact button styling to non-`<button>` elements (dialog actions, calendar day cells, carousel arrows, pagination links).
