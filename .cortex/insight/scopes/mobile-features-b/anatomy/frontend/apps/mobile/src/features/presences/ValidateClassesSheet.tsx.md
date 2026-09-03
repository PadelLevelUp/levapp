---
path: frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 3
size_lines: 366
size_tokens: 3262
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "82bf4f702b415d93bc3eee18baa937f1fde8fe4b173121dc0477c1e15cbc75bd"
---

## Purpose

`ValidateClassesSheet` is the coach's attendance-validation inbox on iOS (PAD-140): classes that have already run, browsed a week at a time, split into "ready to confirm" (everyone's mark is decided) and "needs your input". It uses the same model as web's equivalent dialog — marks live in local `edits` state layered over the stored value and response-based prefill (resolved via `@levelup/config`'s `effectiveMark`), and nothing persists until the coach taps Validate on a specific class. The doc comment calls out two deliberate presentation differences from web, both driven by phone constraints: no bulk multi-select (tapping through classes one at a time beats managing a selection on a small screen, and the "skipped N classes" notice bulk mode produces has nowhere good to live), and only one class card expanded at a time (so a 6-player roster doesn't push the next class off-screen).

## Main players

- `ValidateClassesSheet` (lines 48–252) — critical. The sheet component: owns `edits` (per-class, per-player mark overrides) and `expandedId` state, computes `needsInput`/`ready` groupings from `pending`, and renders the week nav, the pending groups, and a "validated this week" list with per-class undo.
- `Edits` (type alias, line 30) — supporting. `Record<classId, Record<playerId, PresenceMark>>` — the shape of unsaved local overrides.
- `ClassCard` (lines 254–352) — critical. One expandable class row: header (time/title/type, toggles expand) is a sibling of nothing nested — the code comments explicitly warn that nesting a Pressable inside a Pressable breaks touch handling on iOS here, so the Validate button sits outside the header Pressable, not inside it. When expanded, renders one `PresenceMarkToggle` per player (sorted via `sortPlayers`) plus the Validate button (disabled while any player is undecided).
- `sortPlayers` (lines 355–365) — supporting, exported. Sorts undecided players first ("the coach should see what is blocking them"), decided-status ties broken alphabetically by name.

## Insights

- Weeks are computed in raw UTC arithmetic (lines 96–126, mirrored by `weekBounds` in `hooks.ts`) rather than any date library — the comment states this must match `weekBounds` exactly because `start_datetime` is stored naive-UTC server-side, so a local-time boundary would shift the week and drop a late class into the wrong bucket.
- `validateOne` computes presences from `effectiveMark`/`fromMark` (both from `@levelup/config`) rather than raw `edits` — meaning a class can be validated using its *prefilled* marks even for players the coach never touched, not just explicitly-edited ones.
- `remainingFor` (via `undecidedCount`, from `@levelup/config`) is what drives both the needsInput/ready split and the per-card Validate button's disabled state — the same shared function used on web, so a class can never look "ready" on one platform and "needs input" on the other.
- Name is rendered ABOVE the mark toggles, not beside them — a documented layout fix: side-by-side, three buttons left only ~90pt for the name on a 390pt screen, truncating real names (e.g. to "Bernar…"), which was unusable when two players shared a first name.

## Connections

Uses:
- `frontend/apps/mobile/src/features/presences/PresenceMarkToggle.tsx`: one instance per player row inside an expanded `ClassCard`.
- `frontend/apps/mobile/src/features/presences/hooks.ts`: imports the `ValidatePayload` type (the shape `onValidate` expects).

Used by: `frontend/apps/mobile/src/features/presences/PresencesScreen.tsx`: renders this sheet, supplying `pending`/`validated` queues (from `usePendingValidation`) and wiring `onValidate`/`onUnvalidate` to `useValidateClasses`/`useUnvalidateClass`.

Semantically related (not imports): `@levelup/config`'s `effectiveMark`/`fromMark`/`undecidedCount` — the shared present/justified/unjustified resolution logic that both this file and web's equivalent dialog call, guaranteeing the two platforms compute "is this class ready" identically.

## Query pointers

If you need to change how a class's readiness (needsInput vs ready) is computed, read `@levelup/config`'s mark-resolution functions (`effectiveMark`, `undecidedCount`) first — they're shared with web, so a change there affects both platforms.
If you need to change the attendance-marking control itself, go to `PresenceMarkToggle.tsx`.
If you need to change what triggers/hosts this sheet, read `PresencesScreen.tsx`.
