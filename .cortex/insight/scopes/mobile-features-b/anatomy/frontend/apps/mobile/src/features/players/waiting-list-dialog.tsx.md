---
path: frontend/apps/mobile/src/features/players/waiting-list-dialog.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 201
size_tokens: 1652
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "39536a4804c7a5d4593fc58e6bb5b34e73635f5f5c8149b5a373b101bb38cc00"
---

## Purpose

`WaitingListDialog` is the mobile port of web's `AddToStandingWaitingListDialog`: it adds a player to the standing waiting list with a chosen duration (1 week to 2 months) and a max-classes-to-fill "credits" value. Per the doc comment, two controls were deliberately redesigned for mobile rather than ported 1:1: duration uses the mobile `Select` component (web's pill buttons don't map to a single testable element), and credits uses a −/value/+ stepper mirroring web's own stepper for the same field.

## Connections

Uses: `frontend/apps/mobile/src/features/players/hooks.ts`: calls `useAddToStandingWaitingList()` to submit `{playerId, credits, durationDays}`.

Used by: no in-scope file imports this dialog (no in-edges in this scope's L1 data); like `add-to-classes-dialog.tsx`, it's a leaf UI component presumably opened from a player-detail screen outside this scope.
