---
path: frontend/apps/mobile/src/components/error-state.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 64
size_tokens: 467
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1b6eb8ed8fd801c013ce01df63567e270225fdfa23c7684ea62e910eacc1dfd0"
---

## Purpose

`ErrorState` is the shared "something went wrong" placeholder: a centered
destructive-colored icon, translated title/retry-label defaults
(`common.somethingWentWrongTitle` / `common.tryAgain`), optional muted
`message`, and — only when `onRetry` is passed — an outline `Button` with a
fixed `testID` of `"error-state-retry"`. It spreads
`React.ComponentProps<typeof View>` and defaults its own `testID` to
`"error-state"`.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/button.tsx`: the retry button,
  rendered only when `onRetry` is provided.
- `frontend/apps/mobile/src/components/ui/text.tsx`: renders the title,
  message, and retry button label.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be consumed by feature screens throughout the app
for query/mutation error states, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/empty-state.tsx`
— the paired placeholder component for the empty-data case, sharing the
same layout shape and default-`testID` convention. Note title/retry-label
are resolved via `t()` in the function body (not default parameters) so
they stay reactive to a language switch — the file's own comment calls
this out explicitly.
