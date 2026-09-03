---
path: frontend/apps/web/e2e/player-management/player-invite-completion.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 130
size_tokens: 1212
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7f067fb219c5499ec2f1f3381368ed172ac937124fc8e027054012fd8f2e3882"
---

## Purpose

E2E for PAD-32 (`players.invite-completion`): a coach can create an
"incomplete" player (basic info only, no username) and get a secure,
single-use invite link, reusing the coach-invitation token infrastructure
(7-day, single-use). Three tests, sharing the `createPlayerInviteLink` helper
that fills only the Name field and clicks "create...invite"/"invite...player"
to get the shareable `/invite/player/{token}` link from a dialog: (1) the
link is obtainable and well-formed; (2) a fresh unauthenticated browser
context opens the link, the player picks their own username + password
(locale-agnostic label matching for pre-auth pt/en), submits, and lands
either auto-logged-in or at `/auth` (falls back to a manual login) — proving
the profile transitions from pending/inactive to active; (3) an invalid token
shows a locale-agnostic "invalid/expired" message.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point). Its `createPlayerInviteLink` helper is
  local to this file — NOT imported by
  `duplicate-username-warning.spec.ts` or
  `ticket-pad-105-coach-no-username.spec.ts`, which each redefine the same
  create-invite-and-open-link flow inline instead.
- Semantically related (not imports): exercises the invite-link issue/consume
  routes in `player_service.py` / `frontend_api.py` and the invite-completion
  page; covers `.specflow/specs/players/invite-completion.spec.md` in full.
