---
path: frontend/apps/web/src/components/ui/toaster.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 28
size_tokens: 234
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2471b88667c61b35af581087840e4d9a1b4618c06cdd3adf5d555991b7ab38e1"
---

## Purpose

Renders the live list of toasts (from the `useToast` hook) through `toast.tsx`'s primitives. The swipe-to-dismiss direction is explicitly `"down"`, documented as intentional: the viewport is bottom-anchored, so dismissal has to push the toast off the near edge rather than up into the page behind it.

## Connections

Uses:
- `@/components/ui/toast`: `Toast`, `ToastClose`, `ToastDescription`, `ToastProvider`, `ToastTitle`, `ToastViewport` — the primitives this composes.
- `@/hooks/use-toast` (outside this scope): `useToast`, the state hook supplying the `toasts` array.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
