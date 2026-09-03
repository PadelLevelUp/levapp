---
path: frontend/apps/mobile/src/features/players/PlayerForm.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 338
size_tokens: 2752
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c04fb49e0d14ad94aaee436577f30a182a773068ddd108435839fd6b900b9d63"
---

## Purpose

Shared create/edit player form (name, email, phone, level select, side select, notes), mirroring web's `AddPlayerSheet`/`PlayerDetailPage` inline edit. Name-duplicate detection (PAD-17) is a non-blocking WARNING scoped to the coach's own roster (`coachId` narrows `useFieldAvailability`'s check); email-availability is a BLOCKING error. Deliberately has no username field (PAD-105) — a username is the player's own login credential, chosen by them at activation, never set by the coach. An optional secondary "Create & invite" action (PAD-135, `onInvite` prop) renders below the primary submit when provided by the caller — omitted on the edit screen, since an existing player has no creation-time invitation to issue. Both checks (`emailCheck`, `nameCheck`) skip entirely when the field is unchanged from its initial value, so editing a player never flags their own current email/name as a conflict.

## Connections

Uses:
- `frontend/apps/mobile/src/features/players/LevelLabel.tsx` (in scope): `levelOptionLabel`.
- `@levelup/hooks` (frontend/packages/hooks/src/index.ts): `useFieldAvailability`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `CoachLevel`, `PlayerSide`.
- `@levelup/validation` (frontend/packages/validation/src/index.ts): `playerFormSchema`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@/components/ui/{button,input,label,select,spinner,text,textarea}` (outside this scope).

Used by: none within this scope — rendered by the add-player and edit-player screens outside this slice.

Semantically related (not imports): the `side` field's Select options are derived via `useMemo` off the stable `PlayerSide` value rather than storing the translated label in state — the opposite of the "`t()` result frozen in state" anti-pattern seen elsewhere in this app, so the option label re-translates correctly on a language switch.
