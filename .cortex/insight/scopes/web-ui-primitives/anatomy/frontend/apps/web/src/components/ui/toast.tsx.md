---
path: frontend/apps/web/src/components/ui/toast.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 117
size_tokens: 1285
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "309d8ce4a09dd77a6c7ede7ad319f6f884da637b8ea591b2d0e32032fbb834c7"
---

## Purpose

Radix-based toast primitives (`Provider`/`Viewport`/`Toast`/`Action`/`Close`/`Title`/`Description`) with `default`/`destructive` variants via `cva`. LevApp customization is documented inline: the viewport is bottom-anchored at every width — not top, because the login animation's mark and the header both occupy the top of the screen on mobile — with `pb-20` to clear the 64px mobile bottom nav, dropped to `pb-4` at the `md` breakpoint where that nav is hidden.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-toast`: full primitive set.
- `class-variance-authority`: `cva`, for `toastVariants`.
- `lucide-react`: `X` close icon.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `toaster.tsx` (same scope) — consumes these primitives directly to render the live toast list.
- `sonner.tsx` — the second, parallel toast system; see `dual-toast-systems`.
