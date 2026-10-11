---
id: auth.social-sign-in
status: draft
depends_on: [auth.login, auth.register, auth.coach-approval]
implements: ../../specs-business/auth/user-signs-in-with-google-or-apple.business.md
governed_by: []
---

# auth.social-sign-in

### Intent
A coach or a student can sign up and sign in with their Google account (web and iOS) or their
Apple account (iOS), as well as with a username and password. PAD-618. App Store Guideline 4.8:
an iOS app that offers Google sign-in must also offer Sign in with Apple, so iOS offers both or
neither. Every provider ships dark: its button appears only where its client id is configured.

### Entities
- **READS:** the provider's ID token; `User` (by email); `UserIdentity`
- **WRITES:** `UserIdentity` (provider, subject, user, email at link time); a new `User` (+ `Coach`
  or `Player`) through sign-up's own path
- **CREATES:** `UserIdentity` — one row per (provider, provider account), unique on
  (provider, subject); deleted with its user

### Rules
1. **One endpoint, verified tokens only.** `POST /api/auth/social` takes `{provider, idToken,
   nonce?}`, `provider` ∈ `google`, `apple`. The token is verified before anything is read from it:
   - Google: signature against Google's certificates (the cached verifier of admin.foundation
     rule 1), `iss` = accounts.google.com, `aud` ∈ the configured Google client ids
     (`GOOGLE_CLIENT_IDS`: web and iOS), not expired, `email_verified` true.
   - Apple: signature against Apple's published keys, `iss` = https://appleid.apple.com, `aud` =
     the iOS bundle id (`APPLE_CLIENT_IDS`), not expired, and its `nonce` claim equal to the
     SHA-256 of the `nonce` the client sent (replay guard).
   A provider with no configured client id answers 503 `PROVIDER_NOT_CONFIGURED`; a token that fails
   any check answers 401 `INVALID_PROVIDER_TOKEN` and nothing is written. The route shares the
   login throttle (`auth.login` rule 7).
2. **Who it is.** In order: (a) a `UserIdentity` for (provider, `sub`) signs that user in; (b) else an
   account whose email equals the token's verified email (case-insensitive) gets a new identity row
   and is signed in — linking needs the provider to have verified the email, so an attacker cannot
   claim an account with an unverified address; (c) else no account exists: the answer is
   `200 {needsProfile: true, signupTicket, name, email}` and nothing is written. A deleted or
   inactive account is not linked (it answers as auth.login answers that account).
3. **Signed in is signed in.** Cases (a) and (b) answer exactly what the password login answers
   (`auth.login`: the same tokens, the same refusals — a rejected coach is refused, a pending coach
   is told so), so every screen after sign-in is unchanged.
4. **New accounts complete sign-up.** `POST /api/auth/social/complete` takes `{signupTicket, role,
   birthDate, country, termsAccepted}`. The ticket is a server-signed token (15 minutes) carrying
   the verified provider, subject, email and name; a forged or expired one is 401. The account is
   created by sign-up's own checks and side effects (`auth.register` rules 16–19: adults only,
   country, the Terms accepted and recorded; a coach goes through `auth.coach-approval` and the CRM
   sync), with `email` from the provider, no password, a username derived from the email and made
   unique, and its `UserIdentity` row. The answer is the login answer of rule 3. The email counts as
   verified (the provider verified it), so no email code is sent.
5. **Invitations and the coach's QR code are unchanged.** A client that holds a join token or a
   pending invite claim keeps it across the provider round-trip and calls the same join / claim
   endpoints after sign-in, as it does after a password sign-up (`players.join-token`,
   `players.claim`).
6. **No password, still recoverable.** An account created this way has no password; password
   recovery (`auth.password-recovery`) can set one. Signing in with a password stays available to
   accounts that have one.
7. **Clients.** Web: "Continuar com Google" on the sign-in and sign-up screens, through Google
   Identity Services, shown only when the build carries `VITE_GOOGLE_WEB_CLIENT_ID`. iOS:
   "Continuar com Google" and "Continuar com a Apple" on the same screens, shown only when the
   build carries both `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and Sign in with Apple is available on the
   device (Guideline 4.8: together or not at all). On `needsProfile`, both shells show a short
   completion step (role, birth date, country, Terms) pre-filled with the provider's name.
8. **What is kept from the provider.** Name, email and the provider's account id (`sub`). No
   profile photo, no access or refresh token is stored. Apple may give a private relay email; it is
   stored as given.

### Acceptance Criteria

#### A known Google account signs in (rule 2a)
- **Given** a user linked to Google subject `g-123`
- **When** `POST /api/auth/social` {provider: "google", idToken} carries `sub` `g-123`
- **Then** the answer is the login answer for that user

#### A verified email links an existing account (rule 2b)
- **Given** an active user with email ana@example.com and no identity
- **When** a Google token for ana@example.com with `email_verified: true` arrives
- **Then** an identity (google, sub) is written for that user and the answer is their login answer
- **And** with `email_verified: false` it is 401 and nothing is written

#### A new person is asked to complete sign-up (rules 2c, 4)
- **Given** no account for rita@example.com
- **When** a verified Google token for her arrives
- **Then** the answer is `needsProfile: true` with a ticket, her name and email, and no row is written
- **When** she completes with role student, an adult birth date, country PT and the Terms
- **Then** a student account with her email, no password and a Google identity exists, and the
  answer is her login answer
- **And** completing with an under-18 birth date, no country or no Terms is refused as sign-up
  refuses it, and nothing is written

#### Tokens are verified (rule 1)
- **Given** a Google token signed for another client id, an expired one, a wrong issuer, or an Apple
  token whose nonce does not match
- **When** it is posted
- **Then** it is 401 `INVALID_PROVIDER_TOKEN` and nothing is written
- **And** a provider with no configured client id is 503 `PROVIDER_NOT_CONFIGURED`

#### A coach who signs up with Google waits for approval (rules 3, 4)
- **Given** the coach-approval gate on
- **When** a new person completes with role coach
- **Then** the coach is pending, as after a password sign-up, and is synced to the CRM

#### The buttons ship dark (rule 7)
- **Given** a web build without `VITE_GOOGLE_WEB_CLIENT_ID`
- **Then** the sign-in and sign-up screens show no Google button
- **Given** an iOS build without the Google iOS client id
- **Then** neither the Google nor the Apple button shows

### Notes
- Owner setup (PAD-618 ticket and the coordinator's list): Google OAuth consent screen and the web +
  iOS client ids (repo variables `GOOGLE_WEB_CLIENT_ID`, `_STAGING`, `GOOGLE_IOS_CLIENT_ID`); Apple
  App ID capability "Sign in with Apple" and the private-relay email domain.
- The Privacy Policy wording for the data in rule 8 is A's (#672).
- iOS needs a new store build: the Google and Apple modules are native.
- Android (PAD-355) and Apple on the web are later.
- A rejected coach who signed up with a provider has no password, so the re-apply form
  (`auth.coach-approval` rule 12, username + password) is out of reach; the sign-in screen tells them
  they were not approved and gives the contact address. Password recovery can set a password, after
  which re-apply works. A provider-based re-apply is a follow-up if it is ever needed.
