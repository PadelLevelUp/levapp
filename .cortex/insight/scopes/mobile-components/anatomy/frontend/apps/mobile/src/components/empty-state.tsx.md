---
path: frontend/apps/mobile/src/components/empty-state.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 43
size_tokens: 267
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1a484bdb533d893fe5a7cc7160262d90a60392ce3bad645a33eb0187874a72de"
---

## Purpose

`EmptyState` is the shared "nothing here yet" placeholder: a centered icon
(defaulting to a tray outline), bold `title`, optional muted `message`, and
optional `children` (e.g. a call-to-action button) below. It spreads
`React.ComponentProps<typeof View>` and forwards a default `testID` of
`"empty-state"`, so callers can style/position it like any `View` while
tests can find it without passing a testID explicitly.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: renders the title and
  message.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be consumed by feature list/screen components
throughout the app for empty-data states, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/error-state.tsx`
— the paired placeholder component for the error case, sharing the same
layout shape (centered icon + title + message) and default-`testID`
convention.
