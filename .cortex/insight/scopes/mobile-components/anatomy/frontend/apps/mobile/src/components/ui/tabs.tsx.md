---
path: frontend/apps/mobile/src/components/ui/tabs.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 53
size_tokens: 420
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f2311128e83995bd9a38028419053c34f2f7608e67b687ebc3f719c3e692a516"
---

## Purpose

Styled wrapper around `@rn-primitives/tabs`: `Tabs` re-exports the
primitive's `Root`; `TabsList` (the pill track), `TabsTrigger` (reads
`value`/active state off `useRootContext`, sets `TextClassContext` per
active state), and `TabsContent` add NativeWind classes. `TabsTrigger`
carries a documented gotcha: it deliberately omits any `shadow-*`
className on the active tab, because NativeWind's `shadow-*` classes set
CSS variables, and adding them dynamically forces a css-interop "upgrade"
pass after the initial render whose DEV warning `JSON.stringify`s props and
crashes on React Navigation's throwing context getters (a RedBox reading
"Couldn't find a navigation context").

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: `TextClassContext`
  toggles the active/inactive tab label color.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for in-screen tab navigation throughout the
app, outside this scope.
