---
id: auth.parental-consent
status: implemented
depends_on: [auth.register, auth.login, auth.email-verification]
implements: ../../specs-business/auth/minor-signs-up-with-a-guardians-consent.business.md
governed_by: [R-022, R-024]
---

# auth.parental-consent

### Intent
Self-sign-up asks for a date of birth and a country. A person under that country's age of digital
consent gets an account that nobody can use until a parent or legal guardian consents through an
emailed web form; the guardian can withdraw, which anonymises the account. This is the "parental
consent process" the 2026-09-06 privacy policy and terms of service describe and PAD-198 asked for.

### Entities
- **WRITES:** User — new nullable columns `birth_date` (date), `country` (string(2), ISO 3166-1
  alpha-2, upper case), `guardian_consent_status` (string(16): NULL = not required, `pending`,
  `granted`, `revoked`). Existing rows and coach-created players stay NULL and are never gated.
- **CREATES:** GuardianConsent (`guardian_consents`) — `user_id` (FK users, CASCADE), `guardian_email`,
  `guardian_name`, `relationship` (`parent` | `legal_guardian`), `minor_snapshot` (JSON text: name,
  username, birth date, country, role, as the guardian confirmed them), `terms_version`,
  `consent_token_hash`, `consent_expires_at`, `consent_sent_at`, `requested_at`, `consented_at`,
  `consent_ip`, `revoke_token_hash`, `revoked_at`. One row per minor; resending replaces its token.
- **CREATES:** DigitalConsentAge (`digital_consent_ages`) — `country` (string(2) PK), `age` (int). Seeded
  by the migration; read on every request, so an operator changes an age with one
  `UPDATE digital_consent_ages SET age = … WHERE country = '…'` and no deploy.
- **READS:** User, GuardianConsent, DigitalConsentAge

### Rules
1. **Who is a minor.** Age is full years on the UTC date of the request. A person is a minor when
   `age < digital_consent_ages.age` for their country; a country with no row uses
   `DIGITAL_CONSENT_DEFAULT_AGE` (config, default 16). Seed: PT 13, ES 14, IT 14, FR 15, BE 13, GB 13,
   US 13, DE 16, IE 16, NL 16.
2. **Sign-up body** (`auth.register` rules 16–17): `birthDate` (`YYYY-MM-DD`, required, not in the
   future, at most 120 years ago → 400 `field: "birthDate"`), `country` (two letters, required →
   400 `field: "country"`), and for a minor `guardianEmail` (required, a valid email, not equal to the
   person's own email case-insensitively → 400 `field: "guardianEmail"`). An adult's `guardianEmail`
   is ignored. Every rejection also carries a `code`: `BIRTH_DATE_REQUIRED`, `INVALID_BIRTH_DATE`,
   `COUNTRY_REQUIRED`, `INVALID_COUNTRY`, `GUARDIAN_EMAIL_REQUIRED`, `INVALID_GUARDIAN_EMAIL`,
   `GUARDIAN_EMAIL_IS_OWN`. When `birthDate` or `country` is **absent** — an app build from before
   PAD-198 — the `error` text tells the person to update the app, in Portuguese and English, because
   an old build shows the server's message verbatim (coordinator decision 2026-09-10, option A: the
   fields are required on the server and old internal builds may not sign up until updated).
3. **A minor's sign-up** creates the User and the Player/Coach exactly as `auth.register` does, with
   `guardian_consent_status = pending` and `email_verification_required = true` but **no** code sent
   yet, stores `birth_date` and `country`, creates the GuardianConsent row, and mails the guardian
   (rule 6). The response is 201 `{"guardianConsent": "pending", "guardianEmail": "<masked>",
   "resendAvailableInSeconds": 60, "user": {id, name, role, "guardianConsent": "pending"}}` with **no
   `accessToken`**. A pending coach's admin notification (`auth.coach-approval` rule 4) is deferred to
   the moment of consent. An adult's sign-up is unchanged apart from storing birth date and country.
4. **No session before consent** (`auth.login` rule 10). Right credentials of a `pending` user answer
   403 `{"error": "GUARDIAN_CONSENT_PENDING", "guardianEmail": "<masked>",
   "resendAvailableInSeconds": n}`. The JWT blocklist loader also refuses any token of a user whose
   `guardian_consent_status` is `pending` or `revoked`, so no other path (recovery, an old token) can
   open a session. Login refuses a `disabled` user with 401 `ACCOUNT_DISABLED` (`auth.login`
   rule 12, B-053).
5. **Resend** `POST /api/auth/guardian-consent/resend` `{username, password, guardianEmail?}` (no JWT):
   401 on wrong credentials, 409 `NOT_PENDING` unless `pending`, 429 `RESEND_TOO_SOON`
   `{retryAfterSeconds}` within 60 s of the last send. An optional `guardianEmail` corrects the address
   (same validation as rule 2). Issues a fresh token (the old link stops working) and mails it; 200
   `{"guardianEmail": "<masked>", "resendAvailableInSeconds": 60}`.
6. **The consent mail** goes to the guardian in the minor's `language` through
   `email_tools.send_email` (outbox capture and recipient allowlist apply). Subject `Autorização para a
   conta LevApp de <first name>` / `Consent for <first name>'s LevApp account`; branded HTML and plain
   text rendered by `email_templates.py`, one button to `<PUBLIC_WEB_ORIGIN>/guardian-consent/<token>`,
   "valid for 7 days", and "if you do not know this person, ignore this email — nothing happens
   without your consent". The token is 32 random bytes (URL-safe), stored only as a SHA-256 hash, valid
   7 days. A mail failure is logged; the account is still created and resend is the recovery.
7. **The consent page** (web only, `/guardian-consent/:token`, no session). `GET
   /api/auth/guardian-consent/<token>` answers 200 `{minor: {name, username, birthDate, country,
   role}, guardianEmail, termsVersion, expiresAt}` for a pending, unexpired token; 410
   `CONSENT_LINK_EXPIRED` for an unknown, expired or superseded token; 409 `ALREADY_DECIDED` once the
   minor is `granted` or `revoked`. Opening the page changes nothing.
8. **Consenting** `POST /api/auth/guardian-consent/<token>` `{guardianName, relationship,
   confirmMinorDetails: true, acceptTerms: true}`: 400 with `field` for a missing name, an unknown
   relationship or an unticked box; 410 / 409 as rule 7. On success it records `guardian_name`,
   `relationship`, `minor_snapshot`, `consented_at`, `consent_ip`, `terms_version` (config
   `LEGAL_TERMS_VERSION`, default `2026-09-06`); keeps the consent token hash only so that reopening
   the link answers 409 `ALREADY_DECIDED` (it can no longer change anything); issues a revoke token (32
   bytes, hashed, no expiry); sets the user `granted`; sends the minor's first email-verification code
   (`auth.email-verification` rule 6); notifies the admin if the user is a pending coach; mails the
   guardian a confirmation with the withdraw link `<origin>/guardian-consent/revoke/<revoke token>`.
   200 `{"ok": true}`.
9. **Withdrawing.** `GET /api/auth/guardian-consent/revoke/<token>` answers 200 `{minor: {name,
   username}, consentedAt}` while not yet revoked, 410 `CONSENT_LINK_EXPIRED` otherwise. `POST` the
   same URL with `{"confirm": true}` (400 without it) sets `revoked_at`, sets the user `revoked`, and
   anonymises the account with `delete_account_service` (status `disabled`, PII scrubbed, every
   session dead). The consent row is kept as the audit record. Before consenting, the consent page's
   **Não autorizo** does the same through `POST /api/auth/guardian-consent/<token>/decline`
   `{"confirm": true}`. Both confirmation steps state that the child's account and data are removed
   and that this cannot be undone.
10. **Clients** (web and iOS, R-024). The sign-up form gains a date-of-birth field (the browser's
    date input on web; on iOS a `DD/MM/AAAA` field with the number pad — the app's wheel picker opens
    on today, which is slow for a date years back and cannot be driven by the Maestro suite), a
    country select (Portugal pre-selected), and — once the date and country make the person a minor
    by the client's copy of the seed ages, or the server answers `GUARDIAN_EMAIL_REQUIRED` — a
    guardian email field with a one-line explanation.
    After a pending sign-up, and after a 403 `GUARDIAN_CONSENT_PENDING` on login, both screens show
    a "waiting for your guardian" card: the masked guardian email, **Enviar novamente** (60-second
    countdown), **Alterar email do encarregado** and **Voltar a entrar**. The consent and withdraw
    pages are web-only: the guardian arrives from an email link, which always opens a browser (R-024
    exception recorded here and in the PR).
11. **`/api/auth/me`** carries `guardianConsent` (`null` | `granted`) and `birthDate`, `country`.
12. **Test transport.** With `E2E_DEBUG_ENDPOINTS` on, `GET
    /api/auth/guardian-consent/debug/last-link?email=<guardian email>` (404 without the flag) returns
    `{consentUrl, revokeUrl}` parsed from the newest captured mail to that address.

### Acceptance Criteria

#### An adult signs up exactly as before
- **Given** a visitor in Portugal born 2000-01-01
- **When** they POST `/api/auth/register` with `birthDate: "2000-01-01"`, `country: "PT"`
- **Then** the response is 201 with an `accessToken`, `birth_date` and `country` are stored, and `guardian_consent_status` is NULL

#### A minor's account waits for the guardian
- **Given** today is 2026-09-10 and a visitor in Portugal born 2016-05-01 (age 10)
- **When** they POST `/api/auth/register` with `guardianEmail: "mae@example.com"`
- **Then** the response is 201 with `guardianConsent: "pending"`, a masked `guardianEmail` and no `accessToken`
- **And** exactly one mail went to `mae@example.com` with a `/guardian-consent/` link, and no verification code went to the minor
- **And** `POST /api/auth/login` with the right password is 403 `GUARDIAN_CONSENT_PENDING`

#### The age follows the country and is editable without a deploy
- **Given** a person aged 14
- **When** they sign up with country `ES` (14) and, separately, with `DE` (16) and `ZZ` (no row, default 16)
- **Then** `ES` is an adult sign-up and `DE`, `ZZ` are minor sign-ups
- **When** `digital_consent_ages` for `DE` is updated to 14 in the database
- **Then** the next sign-up with `DE` at age 14 is an adult sign-up

#### Sign-up validation names the field
- **When** POST `/api/auth/register` without `birthDate`, with `birthDate` tomorrow, without `country`, or as a minor without `guardianEmail` or with the person's own email as `guardianEmail`
- **Then** each is 400 with `field` `birthDate`, `birthDate`, `country`, `guardianEmail`, `guardianEmail`, and no user is created
- **And** an absent `birthDate` carries `code: "BIRTH_DATE_REQUIRED"` and an absent `country` `code: "COUNTRY_REQUIRED"`, each with an "update the app" message

#### The guardian consents from the email link
- **Given** the pending minor `rita` and the consent link
- **When** the guardian GETs the link's API
- **Then** the response shows `rita`'s name, username, birth date and country, and nothing changed
- **When** they POST name "Maria Silva", relationship `parent`, both boxes ticked
- **Then** the response is 200, the GuardianConsent row has the name, relationship, snapshot, `consented_at`, `terms_version: "2026-09-06"`, a revoke token hash and still the consent token hash, `rita` is `granted`, one verification code went to `rita`'s email and one confirmation mail with a `/guardian-consent/revoke/` link went to the guardian
- **And** `rita` can now log in (200) and is held on the email code screen
- **And** the consent link now answers 409 `ALREADY_DECIDED`

#### Consent requires every declaration
- **When** the guardian POSTs without a name, with relationship `uncle`, without `confirmMinorDetails` or without `acceptTerms`
- **Then** each is 400 naming the field and `rita` stays `pending`

#### Links expire and resend replaces them
- **Given** a consent link sent at 10:00 on day 1
- **When** it is opened on day 8
- **Then** the API answers 410 `CONSENT_LINK_EXPIRED`
- **When** `rita` POSTs resend 30 seconds after a send
- **Then** the response is 429 `RESEND_TOO_SOON`
- **When** she POSTs resend after 60 seconds with a corrected `guardianEmail`
- **Then** a new link goes to the new address and the old one answers 410

#### Withdrawing removes the account
- **Given** `rita` granted and the guardian's withdraw link
- **When** the guardian POSTs the withdraw URL without `confirm`
- **Then** the response is 400 and nothing changes
- **When** they POST `{"confirm": true}`
- **Then** `rita` is `revoked`, her User is `disabled` with name "Deleted user" and no email, her old token is refused, her login is 401, and the consent row still holds the audit fields with `revoked_at`

#### Declining before consenting removes the account
- **Given** the pending minor `rita`
- **When** the guardian POSTs `/api/auth/guardian-consent/<token>/decline` with `{"confirm": true}`
- **Then** `rita` is `revoked` and anonymised exactly as a withdrawal

#### Coach-created players are unaffected
- **Given** a coach creates a player with no birth date
- **When** the player activates and logs in
- **Then** they are never held and `guardianConsent` is null

#### Web: a minor signs up, the guardian consents, the minor gets in
- **Given** a visitor on web `/signup` with `E2E_DEBUG_ENDPOINTS` on
- **When** they sign up as a student born 10 years ago in Portugal with a guardian email
- **Then** the "waiting for your guardian" card is shown with the masked email and no app screen
- **When** the guardian opens the consent link read from the debug route, fills the form and accepts
- **Then** the page confirms, and the minor signing in lands on the email code screen
- **When** the guardian opens the withdraw link and confirms the irreversible removal
- **Then** the minor's sign-in is refused

#### iOS: the same sign-up and waiting card
- **Given** the iOS sign-up screen
- **When** a minor signs up with a guardian email
- **Then** the waiting card is shown with the resend countdown, and signing in before consent shows the same card

### Notes
- Linear: PAD-198. Decisions: the eight defaults the coordinator confirmed on 2026-09-10 (see the
  business spec), a stored hash for every token from the start (PAD-269 lists plaintext tokens as a
  hygiene gap), and `guardian_consent_status` rather than `users.status = inactive` so a minor can
  never be "activated" through the coach-created-account path (`auth.activate`).
- OPEN: automatic deletion of a minor account whose guardian never answers.
- OPEN: asking existing self-registered users for a birth date.
