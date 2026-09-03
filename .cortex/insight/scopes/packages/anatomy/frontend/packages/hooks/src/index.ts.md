---
path: frontend/packages/hooks/src/index.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 6
size_tokens: 60
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f0449cc63346768e024817ae6c5a001ae4938e0eaeebf83d995fff505fe9d65c"
---

## Purpose

Public entrypoint of `@levelup/hooks`: re-exports the platform-neutral TanStack Query hooks (`queries.ts`), the query-key registry (`queryKeys.ts`), and three standalone React hooks (`useCalendar`, `useAutoInviteEnabled`, `useFieldAvailability`). This is what `apps/web` and `apps/mobile` import to share data-fetching logic instead of each reimplementing it against `@levelup/api`.

## Main players

- Barrel re-exports (lines 1–5) — critical. Named re-exports for `useCalendar`, `useAutoInviteEnabled`, `useFieldAvailability`, `queryKeys`, and a wildcard `export * from "./queries"`.

## Insights

- The barrel style is inconsistent on purpose vs. by accident: three hooks are re-exported individually by name, but the ~19 TanStack hooks in `queries.ts` are re-exported via a single wildcard — a reader scanning this file for "what hooks exist" will not see `useDashboard`, `useCalendarEvents`, `useExercises`, etc. listed; they only appear by opening `queries.ts`.

## Connections

Uses:
- `frontend/packages/hooks/src/queries.ts`, `queryKeys.ts`, `useAutoInviteEnabled.ts`, `useCalendar.ts`, `useFieldAvailability.ts`: everything it re-exports.

Used by: no file within this scope (consumers are `apps/web`/`apps/mobile`, outside `packages/`).

## Query pointers

If you add a new hook to this package, decide whether it belongs in `queries.ts` (TanStack query/mutation wrapper — picked up automatically by the wildcard export) or as a standalone file (needs an explicit named export line added here).
