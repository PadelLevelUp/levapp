---
path: frontend/apps/web/src/pages/LandingPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 427
size_tokens: 4588
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f43700e1c817eb58d5e8cc7de11cc7d5bab7424b8eef9ee9533e057fb5cc43b0"
---

## Purpose

The public marketing page a visitor sees at `/` (rendered via `HomeRoute` when there is no session). A long header comment is the durable record of several product decisions (this repo's `specs/` tree is not under git, so the comment is the only place they live): the page is deliberately web-only per the "web and iOS ship together" carve-out in `CLAUDE.md` (it was scoped web-only when requested, and its logged-out audience — academy owners comparing software — maps to the App Store listing on iOS instead); it is one responsive page built from a two-artboard design reference (`reference/design/LevApp Landing Page.dc.html`, desktop 1440 / mobile 390), not two separate pages; it uses the app's design-system color tokens rather than the reference's raw hex values so it themes correctly, except two blocks (the "next class" preview tile and the players strip) which are painted in the brand navy directly, matching the launch-animation background, because token-driving them would turn them white in light mode. Also documents three CTA destinations that had no obvious target in the product: "Pedir demonstração" → mailto support (no demo-request backend endpoint exists), "Ver como funciona" / nav links → in-page anchors (no separate marketing pages exist yet), "Recebi um convite" → `/support` (invitations are tokenised links sent by message, so a lost/missing invite needs a human).

## Main players (notable exports beyond the default)

- `BrandLockup`, `Wordmark` — brand mark components (light/dark variants implied by other pages' `dark:hidden`/`dark:block` pattern).
- `ProductPreview` — the "next class" preview tile mentioned in the header comment, painted in brand navy regardless of theme.
- `ValueCard` — a reusable value-proposition card, presumably repeated across a features/benefits section.

## Connections

Uses: `@/components/ui/button` (outside this scope), `@/lib/utils` (`cn`, this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx` is not the direct consumer for `/` (that route renders `HomeRoute`); `frontend/apps/web/src/auth/HomeRoute.tsx` (this scope) renders `LandingPage` for unauthenticated visitors at `/`.
