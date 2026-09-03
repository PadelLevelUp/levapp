---
path: frontend/apps/mobile/src/components/screen.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 44
size_tokens: 328
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f8d76ce72203cbc6fb3c1f7706350dcddc38942bbd4a23da96ee403ea18864af"
---

## Purpose

`Screen` is the shared page wrapper for feature screens: a `SafeAreaView`
with the app background, an optional self-rendered header `title`, and a
stable structure. `edges` defaults to `["top"]` only when a `title` is
given, otherwise `[]` — the doc comment explains why: tab screens already
get top/bottom insets from the navigator, so a screen with no own header
should not double up on inset handling, but a screen rendering its own
title bar here does need the top inset itself.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: renders the optional
  header title (`role="heading"`, `aria-level={1}`).

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); as the standard screen wrapper it is expected to be used by most
feature screens throughout the app, outside this scope.
