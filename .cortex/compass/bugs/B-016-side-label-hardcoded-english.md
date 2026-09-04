---
id: B-016
title: "A player's court side rendered in English regardless of the coach's language"
type: missing-criterion
severity: medium
status: resolved
affects:
  - players.edit
  - settings.language
  - frontend/packages/types/src/domain.ts
  - frontend/apps/web/src/pages/PlayersPage.tsx
  - frontend/apps/web/src/components/players/detail/PlayerHeader.tsx
  - frontend/apps/web/src/components/players/EditPlayerSheet.tsx
  - frontend/apps/mobile/app/(tabs)/players.tsx
  - frontend/apps/mobile/app/player/[playerId].tsx
related_specs:
  - .specflow/specs/players/edit.spec.md
  - .specflow/specs/settings/language.spec.md
proposed_fix: "Delete the parallel sideLabel()/SIDE_LABELS translation mechanism in @levelup/types and render side badges from the shared locale tree via t(SIDE_LABEL_KEYS[side])."
opened: 2026-09-04T00:00:00Z
closed: 2026-09-04T00:00:00Z
---

# B-016 — A player's court side rendered in English regardless of the coach's language

`packages/types/src/domain.ts` carried a second, parallel translation mechanism:
`SIDE_LABELS` / `SIDE_LABELS_SHORT` covering only `en` and `es`, read by a
`sideLabel()` helper that defaulted to `'en'`. Every side badge on both shells went
through it, so a coach with `language = "pt"` saw "Right" / "Left" / "Both" — a direct
contradiction of `settings.language` rule 4 and its "coach language drives the whole UI"
criterion. Web was internally inconsistent about it too: the add/edit *selects* already
used `t("players.sideLeft"|"sideRight"|"sideBoth")`, only the badges did not.

Fixed under PAD-182 by taking the ticket's option (b): the labels now live only in
`src/locales/{pt,en}/players.json` and are rendered with `t(SIDE_LABEL_KEYS[side])` at
every call site on web and iOS. `sideLabel()` survives as a `@deprecated` shim solely
because `StudentDetailSheet.tsx` (dead code, owned by PAD-167) still calls it with a
hardcoded `'es'` locale — see B-013. Delete the shim with PAD-167.
