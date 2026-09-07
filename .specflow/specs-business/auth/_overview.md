# auth

## What this is

Business outcomes for the auth domain: how a person ends up with a working account and session in
LevApp.

## What it covers

- `auth.coach-signs-in-and-stays-connected` — sign in, silent token renewal, push-notification
  registration, and sign out. Applies equally to coaches and players.
- `auth.newcomer-creates-and-activates-an-account` — the create-inactive-then-activate pattern behind
  every account created *for* someone (coach-created player, invite link's account half).
- `auth.newcomer-signs-up-on-their-own` — a coach or student creates their own account from the
  login screen; a coach waits for LevApp admin approval, then ends up in a club (created, or requested to join).

## Why it's grouped this way

Split on who creates the account and on lifecycle stage: "getting an account working for the first time" (register/activate) is a
different journey, with different failure modes and a different audience moment, than "using that
account day to day" (login/logout/refresh/push). Both outcomes are role-agnostic — the same mechanics
serve coaches and players — because the underlying capabilities don't branch on role.
