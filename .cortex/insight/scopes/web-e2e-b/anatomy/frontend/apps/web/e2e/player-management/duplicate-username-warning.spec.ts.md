---
path: frontend/apps/web/e2e/player-management/duplicate-username-warning.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 90
size_tokens: 893
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "26dc805ba492016123414ae2b6d9adfa53595ab4d627c6631731a6dcf57f971a"
---

## Purpose

E2E for PAD-7 real-time unique-field validation, updated for PAD-105's split
of coach vs. student responsibilities. Two tests cover the two halves that
survive PAD-105 (which removed the username field from the coach's add-player
form entirely): (1) EMAIL uniqueness still lives on the coach's form — typing
an already-taken email (`e2e-coach@test.com`) turns the input red
(`border-destructive`), shows "This email is already taken", preserves the
rest of the form, and disables "Create player" while the error stands; (2)
USERNAME uniqueness moved to the STUDENT's own invite-completion form — the
coach creates an invited player (name only, gets an invite link), the student
opens `/invite/player/{token}` in a fresh browser context and typing a taken
username (`e2e-student`) is rejected with an "already taken" / "já está em
uso" message, and the account is not created.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `AddPlayerSheet.tsx`'s email
  uniqueness check and the invite-completion page's username uniqueness
  check, both backed by `player_service.py`; covers
  `.specflow/specs/players/create.spec.md` and
  `.specflow/specs/players/invite-completion.spec.md`. Companion of
  `player-invite-completion.spec.ts` and
  `ticket-pad-105-coach-no-username.spec.ts` in this scope, which cover the
  rest of the same invite-link machinery.
