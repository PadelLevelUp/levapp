---
path: frontend/apps/web/e2e/clubs/coach-invitation.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 134
size_tokens: 1226
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d74df67a7cc31ae54edf9d548d1143913004b1f5182c055889b5dbdc795f6782"
---

## Purpose

Coach-invitation flow (spec `clubs.coach-invitation`): a coach generates a
shareable `/invite/coach/<token>` link from Settings → Club, a fresh
unauthenticated browser context registers through that link and lands in
the app (or is routed to `/auth` to sign in first), and an invalid or
expired token shows a clear message. The exported `createInviteLink` is
the shared setup the other two tests in this file build on.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openSettings`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/clubs/coach-invitation.spec.md`
  (exact domain/leaf match); notes React sets an input's value as a DOM
  property, not an HTML attribute, so CSS `[value*=...]` selectors never
  match the invite-link input — must read via `inputValue()`.
