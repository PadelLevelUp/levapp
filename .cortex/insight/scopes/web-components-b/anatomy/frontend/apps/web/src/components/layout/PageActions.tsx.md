---
path: frontend/apps/web/src/components/layout/PageActions.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 92
size_tokens: 739
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ff3eb7a01d27938c615abb8b7fafa9b54e534eb3be5443de4a35bc1e1a7ffb6f"
---

## Purpose

A responsive action-button group meant for any page header carrying more than one action: inline buttons on desktop (`sm:flex`, with `flex-wrap justify-end` so a growing action list wraps instead of clipping the last button past the viewport edge — added after the player-profile page's five actions pushed "Delete Player" 6px past a 1280px viewport), collapsed into a "..." dropdown menu on mobile. Each `PageAction` carries an optional `testId` used as `data-testid` on whichever rendered control (button or dropdown item) represents it, so E2E tests have one stable locator regardless of viewport.

## Connections

Uses: `@/components/ui/button`, `@/components/ui/dropdown-menu`; `@/lib/utils` (`cn`).

Used by: page headers across the app (outside this scope) that need more than one header action button.

Semantically related (not imports): `players/detail/PlayerHeader.tsx` — the five-action player-profile header referenced in this file's `flex-wrap` comment is exactly the kind of consumer this component exists to serve, though `PlayerHeader.tsx` itself renders its own single "Edit" button directly rather than going through `PageActions`.
