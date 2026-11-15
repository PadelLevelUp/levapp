---
id: auth.social-sign-in
status: draft
depends_on: [auth.login, auth.register, auth.coach-approval]
serves: [P-AUTH-7]
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
   - Apple: signature against Apple's published keys (fetched with a 5 s timeout; an outage is 503
     `PROVIDER_UNAVAILABLE`), `iss` = https://appleid.apple.com, `aud` = the iOS bundle id
     (`APPLE_CLIENT_IDS`), `exp`/`iat`/`sub` required, not expired, and its `nonce` claim equal to the
     SHA-256 of the `nonce` the client sent (replay guard).
   A provider with no configured client id answers 503 `PROVIDER_NOT_CONFIGURED`; a token that fails
   any check answers 401 `INVALID_PROVIDER_TOKEN` and nothing is written. The route shares the
   login throttle (`auth.login` rule 7).
2. **Who it is.** In order: (a) a `UserIdentity` for (provider, `sub`) signs that user in; (b) else an
   account whose email equals the token's verified email (case-insensitive) gets a new identity row
   and is signed in — linking needs the provider to have verified the email **and the LevApp
   account to have verified it too** (`email_verified_at` set): an account whose own address was
   never confirmed may be someone who pre-registered the victim's email, so it is never linked and
   the answer is 409 `ACCOUNT_EMAIL_UNVERIFIED` (sign in with the password and confirm the email
   first; B-567). Several legacy accounts sharing the address up to case: the oldest. (c) else no
   account exists: the answer is
   `200 {needsProfile: true, signupTicket, name, email}` and nothing is written. A deleted or
   inactive account is not linked (it answers as auth.login answers that account). The identity is
   looked up first, so a returning Apple user (whose token carries no email after the first
   authorization) signs in; without an identity and without a verified email the answer is 401.
3. **Signed in is signed in.** Cases (a) and (b) answer exactly what the password login answers
   (`auth.login`: the same tokens, the same refusals — a rejected coach is refused, a pending coach
   is told so), so every screen after sign-in is unchanged.
4. **New accounts complete sign-up.** `POST /api/auth/social/complete` takes `{signupTicket, role,
   birthDate, country, termsAccepted}`. The ticket is a server-signed token (15 minutes) carrying
   the verified provider, subject, email and name; a forged or expired one is 401. The account is
   created by sign-up's own checks and side effects (`auth.register` rules 16–19: adults only,
   country, the Terms accepted and recorded; a coach goes through `auth.coach-approval` and the CRM
   sync), with `email` from the provider, no password, a username from the first name and four digits
   (never from the email: usernames are searchable in messaging), and its `UserIdentity` row. Two completions of one ticket racing: the loser gets 409
   `ALREADY_COMPLETED`, never a 500. The answer is the login answer of rule 3. The email counts as
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

#### AUTH-SOCIAL-SIGN-IN-1: A known Google account signs in (rule 2a)
- **Given** a user linked to Google subject `g-123`
- **When** `POST /api/auth/social` {provider: "google", idToken} carries `sub` `g-123`
- **Then** the answer is the login answer for that user

#### AUTH-SOCIAL-SIGN-IN-2: A verified email links an existing account (rule 2b)
- **Given** an active user with email ana@example.com and no identity
- **When** a Google token for ana@example.com with `email_verified: true` arrives
- **Then** an identity (google, sub) is written for that user and the answer is their login answer
- **And** with `email_verified: false` it is 401 and nothing is written

#### AUTH-SOCIAL-SIGN-IN-3: A new person is asked to complete sign-up (rules 2c, 4)
- **Given** no account for rita@example.com
- **When** a verified Google token for her arrives
- **Then** the answer is `needsProfile: true` with a ticket, her name and email, and no row is written
- **When** she completes with role student, an adult birth date, country PT and the Terms
- **Then** a student account with her email, no password and a Google identity exists, and the
  answer is her login answer
- **And** completing with an under-18 birth date, no country or no Terms is refused as sign-up
  refuses it, and nothing is written

#### AUTH-SOCIAL-SIGN-IN-4: A pre-registered, unconfirmed account is never taken over (rule 2b, B-567)
- **Given** an active account with email ana@example.com whose email was never confirmed
- **When** a verified Google token for ana@example.com arrives
- **Then** it is 409 `ACCOUNT_EMAIL_UNVERIFIED`, nothing is linked and no token is issued

#### AUTH-SOCIAL-SIGN-IN-5: Tokens are verified (rule 1)
- **Given** a Google token signed for another client id, an expired one, a wrong issuer, or an Apple
  token whose nonce does not match
- **When** it is posted
- **Then** it is 401 `INVALID_PROVIDER_TOKEN` and nothing is written
- **And** a provider with no configured client id is 503 `PROVIDER_NOT_CONFIGURED`

#### AUTH-SOCIAL-SIGN-IN-6: A coach who signs up with Google waits for approval (rules 3, 4)
- **Given** the coach-approval gate on
- **When** a new person completes with role coach
- **Then** the coach is pending, as after a password sign-up, and is synced to the CRM

#### AUTH-SOCIAL-SIGN-IN-7: The buttons ship dark (rule 7)
- **Given** a web build without `VITE_GOOGLE_WEB_CLIENT_ID`
- **Then** the sign-in and sign-up screens show no Google button
- **Given** an iOS build without the Google iOS client id
- **Then** neither the Google nor the Apple button shows

#### AUTH-SOCIAL-SIGN-IN-8: Who a provider token does not let in (rules 1, 2, 3)
- **Given** a disabled account whose email a verified Google token carries
- **When** that token is posted
- **Then** the answer is 401 `ACCOUNT_DISABLED` and no link to the provider is stored
- **And** an Apple token with no email, for an Apple account never seen before, answers 401 and stores nothing
- **And** a provider other than `google` or `apple` answers 400
test: `backend/padel_app/tests/test_pad618_social_sign_in.py` › `test_a_disabled_account_is_refused_as_login_refuses_it` (+2 more)

#### AUTH-SOCIAL-SIGN-IN-9: A sign-up ticket cannot be forged or used twice (rule 4)
- **Given** a sign-up ticket issued for a new person
- **When** the completion is posted with the ticket altered, or with text that is not a ticket
- **Then** the answer is 401 and no account is created
- **And** a ticket already used answers 409; a completion that loses a race with another for the same person answers 409 `ALREADY_COMPLETED`, not an error
test: `backend/padel_app/tests/test_pad618_social_sign_in.py` › `test_a_forged_or_tampered_ticket_is_401` (+2 more)

#### AUTH-SOCIAL-SIGN-IN-10: A deleted account's provider links go with it (rule 8)
- **Given** an account linked to a Google account
- **When** the account is deleted and the same Google account signs in again
- **Then** no link remains, and the person is asked to complete a new sign-up
test: `backend/padel_app/tests/test_pad618_social_sign_in.py` › `test_account_deletion_removes_the_identities`

#### AUTH-SOCIAL-SIGN-IN-11: The web's Google button signs in, starts a sign-up, or says why not (rules 3, 4, 5, 7)
- **Given** the sign-in or the sign-up page with the Google client id configured
- **Then** Google's own button is drawn, in popup mode
- **When** Google hands back a credential
- **Then** it is posted as `{provider: "google", idToken}`; a sign-in answer signs the person in and takes them where a password sign-in would, a remembered destination such as a join link included
- **And** an answer that asks for a profile opens `/signup/complete` with the ticket, the name and the email, and signs nobody in
- **And** a refusal shows its cause beside the button (an invalid token, the provider unavailable, a rejected coach, an unverified email, a disabled account) and signs nobody in
test: `frontend/apps/web/src/components/auth/GoogleSignInButton.test.tsx` › `renders the container and asks Google to draw its button when configured` (+5 more)

#### AUTH-SOCIAL-SIGN-IN-12: The completion page asks what the provider did not give, and refuses before sending (rules 4, 7)
- **Given** the completion page opened with a ticket, a name and an email
- **Then** it shows the name and the email as given
- **When** the person submits with a birth date under 18 or the Terms unticked
- **Then** each field shows its error and nothing is sent; a server refusal that names a field is shown on that field
- **When** they choose a role, give a valid date, tick the Terms and submit
- **Then** the completion is posted with the ticket, the role, the date, the country and the acceptance, and they are signed in and taken where a new account goes
- **And** an expired ticket, or the page opened with no ticket, explains it and links back to `/signup`
test: `frontend/apps/web/src/pages/SocialSignUpCompletePage.test.tsx` › `shows the provider's name and email read-only` (+5 more)

### Notes
- Owner setup (PAD-618 ticket and the coordinator's list): Google OAuth consent screen and the web +
  iOS client ids (repo variables `GOOGLE_WEB_CLIENT_ID`, `_STAGING`, `GOOGLE_IOS_CLIENT_ID`); Apple
  App ID capability "Sign in with Apple" and the private-relay email domain.
- The Privacy Policy wording for the data in rule 8 is A's (#672).
- **Delivered in two steps (coordinator, 2026-10-11).** The server and the web client ship first, dark.
  iOS (Google and Apple together) follows in its own PR: it needs native modules
  (expo-auth-session, expo-web-browser, expo-apple-authentication), the "Sign in with Apple"
  capability on the App ID that only the owner can enable, and a new store build; shipping the
  entitlement before the capability exists would break the next release build
  (`scripts/ios-release.sh` signs with Xcode). Until it lands, iOS shows no provider buttons and
  nothing changes there.
- Android (PAD-355) and Apple on the web are later.
- A rejected coach who signed up with a provider has no password, so the re-apply form
  (`auth.coach-approval` rule 12, username + password) is out of reach; the sign-in screen tells them
  they were not approved and gives the contact address. Password recovery can set a password, after
  which re-apply works. A provider-based re-apply is a follow-up if it is ever needed.
