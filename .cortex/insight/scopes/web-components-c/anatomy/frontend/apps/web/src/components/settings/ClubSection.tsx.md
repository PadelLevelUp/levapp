---
path: frontend/apps/web/src/components/settings/ClubSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 218
size_tokens: 1697
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1afc81cf6ceae11c5843041803c7d63a944cdb0b8b7bdce3d419bc7e477a314e"
---

## Purpose

`ClubSection` is the Settings panel where a coach sees their club and invites other coaches to join it: it loads the current club and its pending invitations on mount, lets the coach create a new shareable invite link (shown in a copy-to-clipboard `Dialog`), and revoke a pending invitation. It renders a loading spinner, a "no club" empty state, or the club card plus a pending-invitations list, each row independently tracking its own revoke-in-flight state via `revokingToken`.

## Connections

Uses:
- `@/api/invitations`: `getCoachClub`, `listCoachInvitations`, `createCoachInvitation`, `revokeCoachInvitation`, and the `CoachClub`/`PendingCoachInvitation` types — the entire data layer for this section.
- `@/components/ui/{button,input,separator,dialog}`, `@/hooks/use-toast`: form/dialog primitives and toast feedback on create/revoke failure.

Used by: not observed within this scope (rendered by the Settings page).
