---
path: frontend/apps/mobile/src/components/ui/toast.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 3
size_lines: 158
size_tokens: 1077
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3396d5c196eef321a3bb4950749c266c8addacd149f5e1ac950deb0a8d265301"
---

## Purpose

A minimal, sonner-style toast system: module-level state (not React
context/provider state) that any code in the app — including code outside
React's render tree — can push toasts into via `toast.success(message,
description?)` / `toast.error(message, description?)`. `ToastHost` mounts
once near the app root, subscribes to that module-level store via
`useSyncExternalStore`, and renders active toasts through a `Portal` into
the app's root `<PortalHost />` so they float above all other UI.

## Main players

- `toast` (lines 55–60) — critical, exported. The public API: `{ success,
  error }`, each calling `addToast` with a fixed variant.
- `ToastHost()` (lines 137–154) — critical, exported. Subscribes to the
  module-level store and renders each visible `ToastItem` inside a
  `Portal`; renders nothing when there are zero toasts. Must be mounted
  once near the app root (`app/_layout.tsx`'s `<PortalHost />`).
- `ToastItem({ record })` (lines 62–131) — supporting, module-private (not
  exported). Renders one toast: enter/exit `Animated` transform+opacity,
  an auto-dismiss timer, and a tap-to-dismiss `Pressable` guarded against
  double-removal.
- `addToast` / `removeToast` (lines 41–48, 50–53) — supporting,
  module-private. Mutate the module-level `toasts` array (capped to
  `MAX_VISIBLE_TOASTS`) and call `emit()`.
- Store primitives — `toasts`, `listeners`, `nextId`, `emit`, `subscribe`,
  `getSnapshot` (lines 24–39) — supporting, module-private. The
  `useSyncExternalStore`-compatible store: a plain module-scoped array plus
  a `Set` of listener callbacks.
- `ToastRecord` / `ToastVariant` (lines 9–16) — supporting, exported types.

## Insights

- The only actually-public surface is `toast` and `ToastHost` (plus the
  `ToastRecord`/`ToastVariant` types) — `export { toast, ToastHost };
  export type { ToastRecord, ToastVariant };` is the whole export
  statement. Everything else named above (`ToastItem`, `addToast`,
  `removeToast`, `emit`, `subscribe`, `getSnapshot`) is module-private.
  This matters because a naive static "exports" scan of this file (e.g.
  listing every top-level named declaration) will both miss `toast` — the
  single most important export — and wrongly list five private helpers as
  public API.
- State lives in module scope, not React state/context: `toast.success(...)`
  works from anywhere, including outside any component and outside React's
  render cycle (e.g. an async callback, a non-React module) — there is no
  provider to wire up, only `ToastHost` needs mounting once.
- `MAX_VISIBLE_TOASTS` (3) is enforced via `.slice(-MAX_VISIBLE_TOASTS)` in
  `addToast` — pushing a 4th toast silently drops the oldest rather than
  queuing it; there is no queue.
- `dismiss()` in `ToastItem` guards on `dismissedRef` so the 3500ms
  auto-dismiss timer and a user tap can't both fire `removeToast` for the
  same record.
- Renders through `@rn-primitives/portal`'s `Portal` directly (named
  `"toast-host"`), which is a different route to the same root
  `<PortalHost />` that `dialog.tsx`, `alert-dialog.tsx`, and `select.tsx`
  reach via their own `@rn-primitives/*` primitive's `Portal` — all four
  ultimately depend on that one root host existing in `app/_layout.tsx`.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: renders the toast
  message and optional description.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); `toast.success`/`toast.error` are designed to be called from
anywhere in the app (feature screens, async handlers), and `ToastHost` is
expected to be mounted once from the app's root layout, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/dialog.tsx`,
`frontend/apps/mobile/src/components/ui/alert-dialog.tsx`,
`frontend/apps/mobile/src/components/ui/select.tsx` — all four rely on the
same root `<PortalHost />` convention, each reaching it through a different
primitive's `Portal`.

## Query pointers

If you need to change toast timing, stacking limit, or dismiss behavior,
this file is self-contained — no other file in this scope needs changing.

If toasts aren't appearing at all, first check that `ToastHost` is actually
mounted once near the app root and that a `<PortalHost />` exists there
(outside this scope, in `app/_layout.tsx`) — the store/emit logic here has
no dependency on that wiring being correct.
