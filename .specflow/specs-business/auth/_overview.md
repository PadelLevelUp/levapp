# auth

## What this is

Business outcomes for the auth domain: how a person ends up with a working account and session in
LevApp.

## What it covers

- `auth.coach-signs-in-and-stays-connected` — sign in, silent token renewal, push-notification
  registration, and sign out. Applies equally to coaches and players.
- `auth.newcomer-creates-and-activates-an-account` — the create-inactive-then-activate pattern behind
  every new account, whether from direct signup or an invite link's account half.
- `auth.visitor-picks-an-audience-and-finds-the-way-in` — the public landing page: a visitor with
  no account picks coach / player / other and is pointed at a demo, the login, support or an email.

## Why it's grouped this way

Split on lifecycle stage: "getting an account working for the first time" (register/activate) is a
different journey, with different failure modes and a different audience moment, than "using that
account day to day" (login/logout/refresh/push). Both outcomes are role-agnostic — the same mechanics
serve coaches and players — because the underlying capabilities don't branch on role.
