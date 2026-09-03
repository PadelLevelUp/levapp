---
path: frontend/apps/web/src/components/ui/alert-dialog.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 105
size_tokens: 1078
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c8b01137c7552e63c9ccf2c38ef92e5417bd6616b6980d56d3015db027465283"
---

## Purpose

Blocking confirmation dialog (e.g. destructive-action confirmations) wrapping Radix AlertDialog. `AlertDialogAction`/`AlertDialogCancel` reuse `buttonVariants` from `button.tsx` so dialog buttons render with the same visual system as regular buttons rather than bespoke styling. Stock shadcn/ui structure.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/button`: `buttonVariants` — styles `AlertDialogAction` (default variant) and `AlertDialogCancel` (outline variant).
- `@radix-ui/react-alert-dialog`: `Root`/`Trigger`/`Portal`/`Overlay`/`Content`/`Title`/`Description`/`Action`/`Cancel` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
