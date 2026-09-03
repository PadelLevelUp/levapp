---
path: frontend/apps/web/src/components/settings/StudentNotificationBlocksSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 255
size_tokens: 2091
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7641c5407eaaaeb311917943577b97dce4a884c11dc54843a767d94ea977f9c2"
---

## Purpose

`StudentNotificationBlocksSection` (PAD-112) is the student-facing (not coach-facing) Settings panel where a student controls three **independent** notification-block levels — block automatic invitations, block manual invitations, block everything — plus a coach-visible reason text. Its doc comment records two deliberate design decisions: "block everything" is a superset in *effect* but not a master switch (flipping it doesn't touch the other two, and turning it off doesn't turn them off), and the whole panel uses a single global Save button rather than mixing that pattern with per-control auto-save (which the notification engine elsewhere in Settings uses) — the comment explicitly warns that mixing save patterns inside one panel produces silently-inconsistent persistence. The confirm dialog for "block everything" fires when the switch flips ON (not at save time) so a cancelled confirm never leaves the UI showing a state the student declined.

## Connections

Uses:
- `@/api/auth` (`getMe`, `updateMe`): loads and persists the three booleans plus the reason text.
- `@/components/ui/{alert-dialog,button,card,label,separator,switch,textarea}`, `@/hooks/use-toast`.

Used by: not observed within this scope (rendered on the student's own Settings page).

Semantically related (not imports): the "flip ON needs confirmation, flip OFF doesn't" gate pattern is a smaller instance of the destructive-confirm style used by `AccountSection` and `ImportHistorySection`, but triggered on a toggle rather than a delete button.
