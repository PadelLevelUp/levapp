---
path: frontend/apps/mobile/src/features/settings/club-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 245
size_tokens: 2095
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "17342786ab2acf47bde5fdb24bbe2bf23252846df89ed241f6dad2aa88dd5c9e"
---

## Purpose

`ClubSection` mirrors web's `ClubSection.tsx`: view the coach's club, invite co-coaches via a shareable link (no email field — web doesn't have one either), and list/revoke pending invitations. It deliberately uses local `useState`/`useEffect` rather than react-query, matching the web source, since this data isn't shared with any other screen so a query cache buys nothing. The doc comment flags a real platform gap: mobile has no clipboard dependency yet, so where web's "copy invite link" button uses `navigator.clipboard`, this renders the link as selectable `<Text selectable>` instead, relying on the OS long-press "Copy" menu rather than adding a new native module mid-task.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `invitationsApi` (`getCoachClub`, `listCoachInvitations`, `createCoachInvitation`, `revokeCoachInvitation`) for all club/invitation data and mutations.

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's coach-only `"club"` section, per `settings-sections.ts`.
