---
path: frontend/packages/config/src/index.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 6
size_tokens: 40
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5041fd93ea33f0a8d08012794a34c6fef07f977daada0d1419335db3ea572748"
---

## Purpose

Public entrypoint of `@levelup/config`: barrel re-export of the design tokens (`tokens.ts`), class-capacity rule (`capacity.ts`), calendar visual-state logic (`calendar-status.ts`), locale-aware dashboard formatting (`dashboard-format.ts`), and the attendance/presence mark mapping (`presence-status.ts`). Together these are the platform-neutral "business + design rules" shared by web and mobile.

## Main players

- Barrel re-exports (lines 1–5) — critical. `export * from "./<module>"` for all five sibling modules.

## Insights

- Unlike `api/src/index.ts`, this barrel IS how consumers within the monorepo are meant to reach these modules (`@levelup/config`) — but note `calendar-status.ts` imports `tokens.ts` directly by relative path rather than through this barrel, since barrels can't be used from inside the same package without a self-referential alias.

## Connections

Uses:
- `frontend/packages/config/src/tokens.ts`, `capacity.ts`, `calendar-status.ts`, `dashboard-format.ts`, `presence-status.ts`: everything it re-exports.

Used by: no file within this scope imports the barrel directly (each config module is consumed individually by other packages); its intended consumers are `apps/web` and `apps/mobile`.

## Query pointers

If you add a new config module (a new shared business rule), add its `export * from "./<name>"` line here so it reaches `@levelup/config` consumers.
