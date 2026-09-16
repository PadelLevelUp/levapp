---
id: decision.2026-09-10-sign-in-with-google
title: "Draft for the owner: Sign in with Google (and Apple) on web and iOS"
date: 2026-09-10T00:00:00Z
compass_rules: []
related_specs:
  - auth.register
  - auth.login
  - auth.email-verification
  - auth.coach-approval
supersedes: []
sources: []
---

# Draft for the owner: Sign in with Google (and Apple) on web and iOS

**Status:** a recommendation from the PAD-252 investigation (Session A, 2026-09-10). Nothing is
decided until the owner answers the questions at the end.

## Recommendation

**Park it for now.** Build it later as one project that adds Google and Apple together, in about
7 working days.

- **The gain is small today.** All 187 accounts have a password, and 184 have a verified email
  (staging copy of prod, 2026-09-09). Only new sign-ups would benefit.
- **It is never "just Google" on iOS.** App Store guideline 4.8 obliges an app that offers Google
  sign-in to also offer an equivalent privacy-preserving login. In practice that means Sign in with
  Apple.
- **It saves less typing than it seems.** Google gives us no username, birth date or country. The
  sign-up completion step for PAD-198 (parental consent) still has to ask for them.

## What exists today (staging 96560cc6)

- **The data model already allows it.** `users.password` is nullable, so a Google-only account needs
  no schema change to exist. `email` is unique and nullable. The one friction point is `username`:
  it is unique, NOT NULL and user-visible.
- **There is no OAuth anywhere.** Login is username plus password, returning a JWT.
- **The iOS app is Expo SDK 54 with EAS build profiles.** It has no sign-in native module. Adding
  one means a new store build, not an over-the-air update.

## The decisions

1. **Account linking, the security-critical rule.** Link a Google identity to an existing account
   automatically only when both are true:
   - the account's `email_verified_at` is set;
   - Google is authoritative for that address, meaning it is `@gmail.com`, or `email_verified` is
     true and `hd` is set. This is Google's own rule.

   Anything else signs in with the password first, then links from Settings. Otherwise, someone who
   registers another person's unverified address could inherit that person's account. The 3
   accounts without an email keep signing in with a password. Unlinking is allowed only while the
   account keeps another way in, either a password or a second identity.
2. **Username.** Ask for it on the first sign-in, prefilled with a suggestion from the name. It
   follows the same rules as `auth.register`: unique, 3 to 80 characters, never `pending-`.
   Coaches and students search each other by username, so generated names nobody chose would end
   up in rosters.
3. **Identity storage.** Add a new `user_identities` table:
   - columns `user_id` (cascade), `provider`, `subject`, `email_at_link`, `created_at`,
     `last_used_at`;
   - unique on (`provider`, `subject`).

   Identify a person by Google's `sub`, never by email, because a Google account can change its
   address. A column on `users` would already need a twin for Apple.
4. **Email verification (PAD-234).** An account created through Google with an authoritative
   address is verified at creation and never sees the 6-digit code. Apple addresses, relay ones
   included, come verified by Apple. Changing the email later in Settings still re-verifies.
5. **Coach approval (PAD-210).** No change. Google proves identity, not entitlement. A coach who
   signs up with Google stays `pending` until a superadmin approves. The completion step says so,
   because "Sign in with Google" reads as instant access.
6. **Apple (guideline 4.8).** The rule asks for "another login service" that:
   - collects only name and email;
   - lets the user hide their email;
   - does not track for ads without consent.

   Apple does not name its own service, but Sign in with Apple is the standard way to comply. The
   web version needs an Apple Services ID and domain verification. Users who hide their email get a
   relay address, and our mail only reaches them through Apple's relay (open question 3).
7. **Minors (PAD-198).** Neither Google nor Apple gives a birth date. The completion step therefore
   asks for birth date and country exactly as password sign-up does (`auth.parental-consent`
   rule 2). A minor's account is created pending guardian consent, with the identity attached but
   inert. Signing in with Google then gets the same 403 `GUARDIAN_CONSENT_PENDING` as a password
   login (rule 4).
8. **Security, non-negotiable.** The backend verifies every ID token itself:
   - the signature against Google's published keys (`https://www.googleapis.com/oauth2/v3/certs`);
   - `iss` is `accounts.google.com` or `https://accounts.google.com`;
   - `aud` is one of our client IDs, for web and for iOS;
   - `exp` has not passed.

   Apple tokens get the same checks against Apple's keys, plus a nonce. The backend never trusts an
   email or profile sent by the client.

## Effort (both providers, web and iOS)

| Part | Days |
|---|---|
| Backend: identities table and migration, token verification, sign-in, link and unlink endpoints, a completion endpoint reusing register and parental consent, tests | 2 to 2.5 |
| Web: Google button, Apple JS, completion form, Settings link and unlink, Playwright | 1.5 |
| iOS: native Google Sign-In and `expo-apple-authentication` config plugins, completion screen, Settings, new EAS build and TestFlight | 2 to 2.5 |
| Consoles: OAuth clients in `padel-levelup-2026`, Apple Services ID and domain, relay sender registration | 0.5 |
| Specs: business and dev | 0.5 |
| **Total** | **about 6.5 to 7.5** |

The ticket's first guess was 2 to 4 days, for Google only.

## Questions for the owner

1. **Park it, or build it now?** The recommendation is to park it.
2. **If built, which scope?**
   - Google and Apple together, on both platforms. This is the recommendation.
   - Google on the web first. This is possible, because guideline 4.8 applies only to the iOS app.
     But it breaks the web-and-iOS parity rule, which needs a written reason.
3. **Can our mail reach Apple relay addresses?** It must come from a sender registered with Apple's
   relay. Prod sends from a gmail.com address today. Confirm that sender can be registered, or
   switch to a `levapp.app` sender, before building. This investigation could not confirm it.
4. **Can supervised children use it?** Can a child's Family Link Google account use "Sign in with
   Google" on a third-party app, and under what parental control? This is not confirmed here. Our
   own guardian consent applies either way.
