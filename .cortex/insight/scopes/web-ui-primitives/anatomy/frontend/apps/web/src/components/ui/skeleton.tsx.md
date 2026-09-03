---
path: frontend/apps/web/src/components/ui/skeleton.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 8
size_tokens: 58
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a229c310b9cbcb01ddd5e580865a6f14a19061aff7f6a97ef82a40b6a83583a4"
---

## Purpose

Minimal stock shadcn/ui pulse-animated placeholder block (`animate-pulse rounded-md bg-muted`). The base primitive that `sidebar.tsx`'s `SidebarMenuSkeleton` and `loading-skeleton.tsx`'s page-shaped skeletons both build on top of.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `sidebar.tsx` (L3, same scope) — `SidebarMenuSkeleton` renders two `Skeleton` instances directly.
