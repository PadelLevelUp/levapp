---
path: frontend/apps/mobile/app/(tabs)/availability.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 294
size_tokens: 2359
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7d4476172f5da7a8baae70c945005f5a20a3a87f87261b564af0ed66777ca6aa"
---

## Purpose

Student-only screen (removed for coaches via the tabs layout's `href: null`) for managing availability "blockers" — one-off or recurring windows a student is unavailable. Lists existing blockers with a floating-action-button add flow, a slide-in `BlockerForm` for create/edit, and an `AlertDialog` delete confirmation whose copy differs for recurring vs single blockers.

## Connections

Uses:
- `@/features/availability/BlockerForm`, `@/features/availability/hooks` (`useCreateBlocker`/`useUpdateBlocker`/`useDeleteBlocker`): outside this scope (mobile-components).
- `@levelup/hooks` (`useAvailabilityBlockers`), `@levelup/api/src/resources/availability` (`AvailabilityBlocker` type), `@levelup/config` (`lightTheme`): outside this scope (packages).

Used by: no file within this scope (routed via expo-router file convention).

## Query pointers

If you need to change what a blocker's summary line says (`describeBlocker`), this is the only place it's formatted — it reads `availability.days.<n>` / `availability.everyDays` / `availability.dateAndTime` i18n keys keyed by JS `getDay()`.
