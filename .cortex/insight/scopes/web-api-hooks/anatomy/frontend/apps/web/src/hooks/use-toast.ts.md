---
path: frontend/apps/web/src/hooks/use-toast.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 187
size_tokens: 982
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8ad4b18eb2571431994e91bed3eb40142dca8bf7a2127683140298d9a1426789"
---

## Purpose

The shadcn/ui toast system's state machine: a module-level reducer (`ADD_TOAST`/`UPDATE_TOAST`/`DISMISS_TOAST`/`REMOVE_TOAST`) driving a single in-memory `memoryState`, a `listeners` array so every `useToast()` call site re-renders on any dispatch, and the imperative `toast({...})` function components call to enqueue one. `TOAST_LIMIT = 1` means only the newest toast is ever shown; `TOAST_REMOVE_DELAY = 2` (milliseconds — the code comment flags this as intentionally short, not the usual multi-second toast library default). This is the standard shadcn/ui generated hook, not hand-written for this app.

## Connections

Uses: `@/components/ui/toast` (outside scope) for `ToastActionElement`/`ToastProps` types; `react`.

Used by: no file within this scope (its consumers are the `<Toaster />` component and every call site that fires a toast, outside `api/`/`hooks/`/`data/`).
