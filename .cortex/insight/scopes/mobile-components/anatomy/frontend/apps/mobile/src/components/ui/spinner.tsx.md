---
path: frontend/apps/mobile/src/components/ui/spinner.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 17
size_tokens: 134
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "59e6c0d67ab0b296916345e743933f74f7d2d41b2626e7bd31c6fce91f55a934"
---

## Purpose

`Spinner` is a thin wrapper over React Native's `ActivityIndicator`, only
defaulting its `color` to the brand primary color from `@levelup/config`'s
`lightTheme` so callers don't need to pass it at every call site.

## Connections

Uses: (no other files in this scope; imports `@levelup/config`,
`react-native`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for inline loading indicators throughout
the app, outside this scope.
