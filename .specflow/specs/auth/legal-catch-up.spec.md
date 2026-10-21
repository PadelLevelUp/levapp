---
id: auth.legal-catch-up
status: implementing
depends_on: [auth.register, auth.login]
implements: ../../specs-business/auth/newcomer-creates-and-activates-an-account.business.md
governed_by: []
---

# auth.legal-catch-up

> Linear: PAD-637 (PAD-602 privacy review, D4). Owner decision 2026-10-12: existing users with no
> Terms record or no date of birth get ONE screen at their next login asking for what is missing,
> with the 18+ check; the screen is skippable.
> iOS end to end: Maestro flow `259-legal-catch-up` (rules 2–5), on the seed's `e2e-legacy-student`.

### Intent
Accounts completed before the Terms were recorded on every path (24 of 25 active users on
2026-10-11), and accounts created before the birth-date rule (20 of 25), are asked once per login
for what is missing, without being locked out.

### Entities
- **READS / WRITES:** User (`terms_accepted_at`, `terms_version`, `privacy_version`, `birth_date`)

### Rules
1. **What is pending.** `GET /api/auth/me` returns `legalPending: {terms, birthDate}`: `terms` is true
   when `terms_accepted_at` is NULL; `birthDate` is true when `birth_date` is NULL. Nothing else
   changes in the payload.
2. **One screen, only the missing parts.** After login (and on app start with a stored session), a
   client whose `me.legalPending` has any true part opens one screen — web `/legal-catch-up`, iOS
   `legal-catch-up` — before the landing it would otherwise go to, and after email verification
   (`auth.email-verification`). It shows the Terms checkbox and links (as `auth.register` rule 19)
   when `terms` is pending, and the birth-date field (web date input, iOS DD/MM/AAAA, as sign-up) when
   `birthDate` is pending.
3. **Saving.** `POST /api/auth/me/legal` `{termsAccepted?, birthDate?}`, authenticated. Each pending
   part is required: `terms` pending and `termsAccepted` not `true` → 400 `{field: "terms", code:
   "TERMS_REQUIRED"}`; `birthDate` pending and judged by `auth.register` rule 18 (one shared check) →
   400 `BIRTH_DATE_REQUIRED`, `INVALID_BIRTH_DATE` or `UNDERAGE` on `field: "birthDate"`. A part that
   is not pending is ignored (an accepted record or a stored date is never overwritten). Any refusal
   writes nothing. Success records the Terms with `record_terms_acceptance` and the date on
   `users.birth_date`, and answers the new `me` (with `legalPending` all false).
4. **Skippable (owner).** "Agora não" / "Not now" leaves the screen without saving. The skip lasts the
   session: the screen comes back at the next login while anything is still pending. The skip is held
   in memory per user (`legalCatchUpSession` in `@levelup/config`, as the email prompt's dismissal,
   `auth.email-verification` rule 14): a reload, a relaunch or a sign-out starts a new session.
5. **Under 18.** An `UNDERAGE` refusal shows "Esta app só aceita maiores de 18 anos." under the field
   and saves nothing; skipping stays possible (owner: skippable; default sent 2026-10-12).
6. **Not a gate.** No route refuses a user with `legalPending`; only the post-login routing opens the
   screen. A coach pending approval or a user pending email verification sees those screens first.

### Acceptance Criteria

#### `me` says what is pending (rule 1)
- **Given** a user with no Terms record and no birth date
- **Then** `GET /api/auth/me` has `legalPending: {terms: true, birthDate: true}`
- **And** a user with both has `{terms: false, birthDate: false}`

#### Saving records only what was pending (rule 3)
- **Given** a user with no Terms record but a stored birth date
- **When** they POST `{termsAccepted: true, birthDate: "2001-01-01"}`
- **Then** the Terms are recorded with the current versions and the stored birth date is unchanged

#### A missing part is refused and nothing is written (rule 3)
- **Given** a user with both parts pending
- **When** they POST `{termsAccepted: true}` with no birth date
- **Then** the answer is 400 `BIRTH_DATE_REQUIRED` and no Terms record is written

#### Under 18 is refused (rules 3, 5)
- **When** the birth date makes them 17
- **Then** the answer is 400 `UNDERAGE` and nothing is written

#### The screen opens after login and can be skipped (rules 2, 4)
- **Given** a student with `legalPending.terms` true
- **When** they log in
- **Then** the catch-up screen opens with the Terms box and no birth-date field
- **And** "Not now" takes them to their usual landing, and the screen does not reopen in that session
