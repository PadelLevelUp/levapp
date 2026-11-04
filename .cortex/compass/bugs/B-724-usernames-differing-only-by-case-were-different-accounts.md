---
id: B-724
title: "Usernames were case-sensitive: \"Bernardo\" and \"bernardo\" could be two accounts, a capitalised sign-in failed, and three lookups picked an arbitrary account of such a pair"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - auth.register
  - auth.login
  - messaging.direct-by-username
  - backend/padel_app/tools/username_tools.py
  - frontend/packages/config/src/signup-username.ts
proposed_fix: "auth.register rule 2a: chosen usernames are stored trimmed and lowercase and unique ignoring case; lookups take the exact spelling, else the one case-insensitive match; a gated migration lowercases the stored rows once the existing pairs are resolved."
opened: 2026-11-03T10:26:00Z
resolved: 2026-11-03T13:00:00Z
---

# B-724: usernames differing only by case were different accounts

**Source:** Linear PAD-799 (owner, 2026-11-03).

**What happened:**
- **Choosing.** Sign-up, activation and both invitations stored the username exactly as typed.
  "Already taken" compared case-sensitively, so `Bernardo` could be created next to `bernardo`.
  Prod holds 3 such pairs (6 accounts) and 88 usernames with capitals (PAD-799 comment of 3 Nov).
- **Signing in.** Sign-in matched the exact spelling only. A capital typed by the keyboard ("Bernardo"
  for `bernardo`) was "Invalid credentials".
- **Arbitrary pick.** Messaging by username, a claim by username and class-request participants
  already compared ignoring case, but took `.first()`. For a pair, that picked an arbitrary one of
  the two accounts.

**What should happen:** auth.register rule 2a and auth.login rule 1a.

**Root cause:** rule 2 said "unique" without saying how case counts, so each path chose its own
comparison (type incomplete-rule).

**Evidence:** `test_pad799_usernames_are_lowercase.py` failed 14 of 16 on staging `68bcf70b4`. Web,
mobile and `@levelup/config` tests failed on the field keeping the typed capitals. The red outputs
are on PAD-799.

### Resolution
- **Spec:** auth.register rule 2a (with a temporary part until the migration) and two criteria;
  auth.login rule 1a and two criteria; messaging.direct-by-username rule 2.
- **Code:**
  - `username_tools`: `normalize_username`, `find_user_by_username` (exact, else the unique
    case-insensitive match) and `username_taken`, used at every choosing and lookup site.
  - `typedChosenUsername` in `@levelup/config` is applied on the web and mobile choosing fields. The
    sign-in and lookup fields send what was typed, never auto-capitalised or corrected.
- **Migration:** `migrations/pending/a7c3e9d1b799` sits outside the Alembic chain, because every
  deploy runs `flask db upgrade`. It refuses, naming ids only, while a pair or an invalid username
  exists. It lands once the owner has resolved the pairs.
