---
path: frontend/apps/mobile/src/features/availability/BlockerForm.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 259
size_tokens: 2165
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b96db99cdd054b0d4be2916105d3fb1f023aaa4da1c718c1d938b9a3fa9d361a"
---

## Purpose

Create/edit form for a student's availability blocker (PAD-28): a window a student marks unavailable, which suppresses automatic class invitations during that time. Wraps the shared `availabilityBlockerSchema` (zod) with mobile-specific plain-text date/time regex validation, since the mobile inputs are plain text rather than native date/time pickers wired to a stricter schema. Manages local state for title, date, start/end time, a weekly-recurring toggle with day-of-week multi-select, and an end date; on save it builds either a one-off or recurring `BlockerPayload` and hands it to the caller's `onSubmit`. All student blockers are backend-forced to type "unavailable" — `blockerTypeLabel` is a static label helper, not a real type resolver, mirroring web's static badge text.

## Connections

Uses:
- `@levelup/api/src/resources/availability` (frontend/packages/api/src/resources/availability.ts): `AvailabilityBlocker` / `BlockerInput` types.
- `@levelup/validation` (frontend/packages/validation/src/index.ts): `availabilityBlockerSchema`, extended locally with date/time regex fields.
- `@/lib/utils` (frontend/apps/mobile/src/lib/utils.ts, outside this scope): `cn`.
- RN UI kit (`@/components/ui/*`, outside this scope): Card, Button, Input, Switch, DatePickerInput, TimePickerInput, Label, Spinner, Text.

Used by: none within this scope — no in-scope file imports it; it is presumably rendered by an availability screen under `apps/mobile/app/`.

Semantically related (not imports): mirrors web's `AvailabilityPage.tsx` form — same schema, same backend contract, same "unavailable"-only badge text.
