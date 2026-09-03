---
path: frontend/apps/web/src/components/players/AddPlayerSheet.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 279
size_tokens: 2418
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f81e9ab78fcfc402082f4924f90a2da99bbe59cbcc764800fab1ef10b11803eb"
---

## Purpose

A side sheet for creating a new player: name/email/phone/level/side/notes, with live email-availability checking and a coach-scoped name-collision check (PAD-17), plus two save paths — `onSave` (create silently) and the optional `onInvite` (create AND send an invite email), rendered as two separate footer buttons when `onInvite` is supplied. Name collisions are a WARN, not a blocker — surfaced via `nameCheck.error` but deliberately excluded from `hasFieldError` so a coach can still save two real players who happen to share a name; email collisions ARE blocking (`hasFieldError = !!emailCheck.error`).

## Connections

Uses: `@/hooks/useFieldAvailability` (outside this scope) twice, once for `email` (blocking) and once for `name` scoped to `coachId` (warn-only); `@/components/LevelLabel` (outside this scope); `@/components/ui/sheet`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/label`, `@/components/ui/select`; `@/types` (`CoachLevel`, `PlayerSide`).

Used by: the players list page (outside this scope), which supplies `levels`, `coachId`, and the `onSave`/`onInvite` handlers.

Semantically related (not imports): `players/EditPlayerSheet.tsx` — the edit-mode counterpart, sharing the same field set (name/email/phone/level/side/notes) but a different UX shape (two-step edit-in-place vs. this sheet's always-editable form) and no live availability checking on edit.
