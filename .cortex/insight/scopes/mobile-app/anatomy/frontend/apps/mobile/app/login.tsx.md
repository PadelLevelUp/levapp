---
path: frontend/apps/mobile/app/login.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 203
size_tokens: 1797
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "711d147fbe734ec2c9b291ea80934067670ee55121582009155c09e22a91c531"
---

## Purpose

The login screen: username/password form with local zod validation (`loginSchema` from `@levelup/validation`), a distinct network-vs-401-vs-other error message, and the brand mark + wordmark rendered as two React `Text` nodes with precise line-height/optical alignment rather than an image.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `login()` (unresolved alias).
- `@/components/brand/LevAppMark`, `@/components/ui/*` (button, card, input, label, text): outside this scope.
- `@levelup/api` (`getApi().post("/auth/login", ...)`), `@levelup/validation` (`loginSchema`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- Login POSTs directly via `getApi().post(...)` rather than through `AuthContext.login()`'s own network call — `login(token)` here only handles persisting the token and hydrating `/auth/me`; the actual credential exchange is inlined in this screen so it can distinguish a network failure (no `err.response` at all) from a 401 credential rejection. This distinction traces to a real incident: a 2026-07-24 App Store rejection screenshot showing "Could not sign in" was actually a review build pointed at an unreachable API URL, not a login bug — this file's three-way error branch exists specifically so that failure mode surfaces as a network error, not a generic "wrong password" message.
- The brand mark is sized to the wordmark's cap-height (not its line-box) with a comment noting Poppins caps run ~0.70em of the type size, plus a 1px optical nudge for the "A" apex — `items-center` alone only centers bounding boxes, which visibly misaligned the two.
- A comment notes this screen used to hand-type "LevelUp" with a hardcoded blue split, predating the LevApp rebrand — it was the last screen where the old name survived in live, user-visible text.
