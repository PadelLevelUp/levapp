---
path: frontend/apps/web/src/api/fields.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 3
size_lines: 4
size_tokens: 18
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cfc1d1e9a636573ca9dfa135d2b94e0f5d148efe4ccb16ae2be406bc2d501afb"
---

## Purpose

A four-line pass-through: imports `./client` for its `initApi()` side effect, then `export *`s everything from `@levelup/api/src/resources/fields` (the `checkFieldAvailable` debounce-friendly field-uniqueness check). It exists purely so web code can `import { checkFieldAvailable } from "@/api/fields"` under the app's own path-alias convention rather than reaching into `@levelup/api` directly — the same thin-barrel pattern used by `availability.ts`, `invitations.ts`, `notificationEngine.ts`, and `playerInvitations.ts` in this scope, all of which have no web-specific logic (no mock branch, no wrapping) to add.

## Main players

- The two-line body (lines 1–3): `import "./client"` then `export * from "@levelup/api/src/resources/fields"` — no named symbols of its own; everything it exposes is `@levelup/api`'s.

## Insights

- Marked high-centrality by the scope's structural ranking despite its trivial size — it's the one file in the scope whose relative import (`./client`, resolved to `frontend/apps/web/src/api/client.ts`) L1 could actually resolve, unlike the identical-shape `availability.ts`/`invitations.ts`/`notificationEngine.ts`/`playerInvitations.ts` barrels, which import `client.ts` via the `@/api/client` alias L1 did not resolve for this scope. All five files are otherwise functionally and structurally identical.
- `frontend/packages/hooks/src/useFieldAvailability.ts` (outside this scope) imports `checkFieldAvailable` directly from `@levelup/api/src/resources/fields` rather than through this barrel — this file's actual web-app consumers are components/pages calling `@/api/fields`, not the hooks package.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect (the one edge L1 resolved for this file).

Used by: no file within this scope — its consumers are web components/pages outside `api/`, `hooks/`, `data/`.

## Query pointers

If you're adding a new thin resource re-export barrel like this one, use this file (or `availability.ts`) as the template: `import "./client";` (or `"@/api/client"`) then `export * from "@levelup/api/src/resources/<name>";`.
