---
path: frontend/apps/mobile/app/(tabs)/players.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 356
size_tokens: 2876
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ab3fb7f5b41406c72e6db9ceaff16c00bc64835914ab13c3ac90ee1bd9cff4c0"
---

## Purpose

The Players tab (coach-only): debounced-search, sortable, paginated roster list with "missing level" / "missing side" data-quality filter chips, each row navigating to `/player/[playerId]`.

## Connections

Uses:
- `frontend/apps/mobile/src/lib/utils.ts`: `cn()` for the active-filter chip styling (unresolved alias).
- `@levelup/hooks` (`useCoachPlayersPaginated`), `@levelup/config` (`lightTheme`), `@levelup/types` (`sideLabel`, `CoachPlayer`): outside this scope (packages).
- `@/components/*` (avatar, badge, button, input, select, skeleton, text): outside this scope.

Used by: no file within this scope.

## Insights

- `sortOption`-style pattern (also seen in `class/new.tsx`'s `classType`, `event/new.tsx`'s `type`): the select's VALUE is kept as a plain string in state and the translated LABEL is re-derived via `useMemo` on every render — not stored — specifically so the visible dropdown label re-translates immediately on a language switch instead of freezing in whatever language was active when it was picked. A `t()` result stored directly in state is a recurring trap across this scope; grep for `React.useMemo(() => ... .map((o) => ({ value: o.value, label: t(...` to find the pattern applied correctly.
