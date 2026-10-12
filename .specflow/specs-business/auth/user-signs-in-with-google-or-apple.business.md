---
id: auth.user-signs-in-with-google-or-apple
status: draft
implemented_by:
  - ../../specs/auth/social-sign-in.spec.md
---

# User signs in with Google or Apple

## Outcome

A coach or a student creates their LevApp account, and signs in afterwards, with the Google account
they already have — on the web and on the iPhone — or with their Apple account on the iPhone,
instead of inventing another password. Someone who already has a LevApp account with the same email
lands in that account, not in a new one.

## Who This Is For

Coaches and students who would rather not create and remember another password, and students who
arrive through their coach's invite link or QR code.

## User Journey

1. On the sign-in or sign-up screen, the person taps "Continuar com Google" (or, on the iPhone,
   "Continuar com a Apple").
2. The provider asks them to choose their account and confirm.
3. If they already have a LevApp account with that email, they are in.
4. If not, LevApp asks the few things sign-up always asks — are they a coach or a student, their
   date of birth and country, and to accept the Terms — with their name already filled in.
5. A student who came from a coach's invite or QR code ends up linked to that coach, as with a
   password sign-up. A coach waits for approval, as with a password sign-up.

## Business Rules

1. The same checks as a password sign-up: adults only, country, the Terms accepted, coaches approved.
2. An existing account is joined only when the provider has verified the email.
3. LevApp receives the name, the email and an account id from the provider — never the password,
   and it does not keep the profile photo.
4. On the iPhone, Google and Apple are offered together or not at all (App Store rule 4.8).
5. Each button appears only once the provider is set up; until then nothing changes for anyone.

## Success Metrics

- Share of new accounts created with Google or Apple (not yet measured).

## Out of Scope

- Android (after the Play listing, PAD-355) and Apple on the web.
- Linking a second provider to an account from settings.

## Notes

- OPEN: none.
