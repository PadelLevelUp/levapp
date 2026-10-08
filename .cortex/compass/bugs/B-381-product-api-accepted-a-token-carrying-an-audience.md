---
id: B-381
title: "The product API accepted a token carrying an `aud` claim as the user whose id equals `sub`: Flask-JWT-Extended verifies no audience unless one is configured"
type: wrong-rule
severity: high
status: open
affects:
  - admin.foundation
  - backend/padel_app/auth.py
proposed_fix: "The product JWT blocklist loader refuses any token that carries an `aud` claim (401), so an admin token signed with the same JWT_SECRET_KEY can never act as a product user; pinned by the 'Tokens do not cross' test."
opened: 2026-10-07T19:32:08Z
---

# B-381: the product API accepted a token carrying an audience

**Source:** PAD-531 (Session E, 2026-10-07), found by a probe before any admin code existed.

**What the spec said:** `admin.foundation` rule 3: every product route answers 401 for a token whose
`aud` is `levapp-admin`. Its note claimed PyJWT rejects a token that carries an `aud` when the
verifier expects none, "so the product side may need no change".

**What happened:** Flask-JWT-Extended 4.6.0 passes no audience to PyJWT and disables the audience
check when none is configured. A token `{sub: "<user id>", aud: "levapp-admin", …}` signed with
`JWT_SECRET_KEY` was accepted by `GET /api/auth/me` and answered that user's profile (probe on
staging's code, 7db0e3f4a, SQLite app). Admin tokens use `sub = admin_roles.id`, which collides with
user ids, so the first console token minted would have been a valid product session for some user.

**Why it was latent:** today only `utils/tokens.py` mints tokens (`create_access_token` with
`auth_time`), never with `aud`; no client could produce one. It becomes live the day the console
issues its first token.

**Root-cause class:** a rule written on a library assumption nobody ran. Wrong rule (the note).

**Fix (PR 1 of PAD-531):** `register_jwt_handlers`' blocklist loader returns True for any payload
with an `aud` claim → 401. Red test: `test_pad531_plumbing.py::test_tokens_do_not_cross` (mutant:
the check removed). Numbering of the ledger id is unconfirmed (range B-381–B-400 reserved for
Session E).
