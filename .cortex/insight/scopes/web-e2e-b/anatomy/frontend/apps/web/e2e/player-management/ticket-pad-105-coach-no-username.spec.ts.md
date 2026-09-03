---
path: frontend/apps/web/e2e/player-management/ticket-pad-105-coach-no-username.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 181
size_tokens: 1854
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f7488abdf961895da79f84b48b2f60e363f867b5ab3bf306a5345139f13c1c44"
---

## Purpose

E2E for PAD-105: the coach never chooses a player's username — that's a
credential, so it belongs to the student. Four tests assert the negative
space AND the positive replacement across every surface: (1) the add-player
sheet has no username input/label of any kind (checked by testid, placeholder,
AND accessible label, to catch it being reintroduced under any guise) and a
player is created from a name alone; (2) the player-detail view — both at rest
and in inline edit mode — never renders a username field or the internal
`pending-[0-9a-f]{4}` placeholder the backend generates; (3) the player's OWN
registration link (`/register/{userId}`, distinct from the invite-link flow)
renders an EMPTY (not prefilled) username box — prefilling the internal
placeholder would leak an implementation detail and nudge the student toward
keeping a machine-generated login — while the coach-set name IS prefilled, and
completing registration with a freshly-chosen username then logs in
successfully; (4) confirms the username field still exists on the OTHER
route into an account, the student's own invite-link flow (`/invite/player/{token}`),
proving PAD-105 didn't remove username entry entirely, only moved it off the
coach's form.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point). Its local `openAddPlayerSheet` helper
  is not imported elsewhere; `duplicate-username-warning.spec.ts` and
  `player-invite-completion.spec.ts` each redefine an equivalent flow inline.
- Semantically related (not imports): exercises `AddPlayerSheet.tsx`,
  `PlayerHeader.tsx`, `RegisterPage.tsx`, and the invite-completion page, all
  backed by `player_service.py`'s placeholder-username generation; covers
  `.specflow/specs/players/create.spec.md` rules 4-6 in full, and touches
  `.specflow/specs/players/invite-completion.spec.md` for its fourth test.
