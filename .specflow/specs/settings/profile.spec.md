---
id: settings.profile
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.profile


### Intent
Let a signed-in coach view and edit their own account profile — display name, abbreviation (the short
initials badge shown next to them across the app), email, and phone — from the Settings screen, and have
those edits actually persisted on the `users` row. Before PAD-81 the Settings "Profile" panel was purely
local component state seeded with hardcoded values: Save fired a success toast without ever calling the
backend, so the toast lied and every edit was lost on reload. The backend's `PATCH /api/auth/me` only
accepted `language`, so there was no way to persist the rest.

Scope: the coach's *own* profile only. Editing other users, avatar upload, bio, and password change are
out of scope (no backend support exists for them).

### Entities
- **User** (`users`) — extends auth.login's User entity:
  - `name` — display name, required, non-empty.
  - `abbreviation` (`users.abbreviation`, new): optional short badge label, max 4 characters, stored
    uppercased. When unset, the abbreviation is **derived** from the first letters of the first two words
    of `name` (existing behaviour of `serialize_user`).
  - `email` — optional, unique across users when set.
  - `phone` — optional free-text.

### Rules
1. `GET /api/auth/me` returns the signed-in user's `name`, `abbreviation`, `email`, and `phone` alongside
   the existing identity fields, so the Settings profile form can be populated from the server rather than
   from hardcoded defaults.
2. `PATCH /api/auth/me` accepts any subset of `name`, `abbreviation`, `email`, `phone` (still alongside
   `language`) and persists them on the `users` row. Fields not present in the payload are left untouched.
3. `name` must be a non-empty string after trimming; a blank or whitespace-only name is rejected with 400.
4. `email` must be syntactically valid when non-empty and must not already belong to another user —
   a duplicate is rejected with 409. An empty string clears the email to `NULL`.
5. `abbreviation` is trimmed, uppercased, and limited to 4 characters; an empty string clears the stored
   value and the response falls back to the derived initials of `name`.
6. `phone` is trimmed; an empty string clears it to `NULL`.
7. The success notification is only shown **after** the API confirms the write. A failed request shows an
   error notification and never a success one — no optimistic success toast.
8. After a successful save, a reload of the Settings screen shows the newly saved values (the form is
   hydrated from `GET /api/auth/me`, not from local defaults). A field the user edits before that
   read lands keeps what they typed; every other field is still filled from it (B-263), so a save never
   sends a field the user did not touch. A field typed in and left empty before the read lands counts as
   untouched and takes the loaded value, so a save can never clear it by accident.
9. Saving an `email` that differs from the stored one (case-insensitively) clears `email_verified_at`,
   marks the account as needing verification and mails a 6-digit code to the new address, best-effort
   (`auth.email-verification` rules 1, 3 and 6). The response's `emailVerification` is `"pending"`
   and the client opens the code screen right after the save. Saving the same address (any case) does
   not touch the verification state; neither does a save that omits `email`. Clearing it (`""`,
   whitespace or `null`) also clears the verification — no timestamp, nothing required, no pending
   code — so the account reads `unverified` (B-262). The state is shown next to the field on web and iOS
   (`auth.email-verification` rule 9).

10. **Date of birth (PAD-640).** `GET /api/auth/me` returns `birthDate` (ISO or `null`); `PATCH
    /api/auth/me` accepts `birthDate` and judges it with `auth.register` rule 18's one shared check:
    a real past date (`YYYY-MM-DD`) of someone aged 18 or over on the day of the save. A missing,
    empty or malformed value is 400 `INVALID_BIRTH_DATE` and an under-18 date is 400 `UNDERAGE`, both
    on `field: "birthDate"`, and nothing in that PATCH is written. A stored date can be changed, never
    cleared. Web shows a date input and iOS sign-up's DD/MM/AAAA field, both in Perfil for every role;
    `UNDERAGE` shows "Esta app só aceita maiores de 18 anos." under the field.
11. **Country (PAD-640).** Perfil also edits the country (the `COUNTRIES` list, `auth.login` rule 13's
    `PATCH /me` check: two letters, upper-cased, or 400 `INVALID_COUNTRY`; never cleared). Both fields
    save with the tab's one "Guardar alterações" (`settings.explicit-save`) and send only when changed
    (rule 8).

### Acceptance Criteria

#### Profile is loaded from the server
- **Given** an authenticated coach whose stored name is "E2E Coach"
- **When** they open Settings → Profile
- **Then** the Name field shows their real stored name, not a hardcoded placeholder

#### Coach edits and saves their profile
- **Given** an authenticated coach on Settings → Profile
- **When** they change name, abbreviation, email and phone and click Save
- **Then** the request `PATCH /api/auth/me` succeeds
- **And** a success notification is shown
- **And** after reloading the page the fields still show the newly saved values

#### Save failure does not report success
- **Given** an authenticated coach on Settings → Profile
- **When** the save request fails
- **Then** an error notification is shown
- **And** no success notification is shown

#### Blank name is rejected
- **Given** an authenticated coach
- **When** they PATCH `/api/auth/me` with `{"name": "   "}`
- **Then** the response status is 400
- **And** the stored name is unchanged

#### Duplicate email is rejected
- **Given** two users, where user B already has email `taken@example.com`
- **When** user A PATCHes `/api/auth/me` with `{"email": "taken@example.com"}`
- **Then** the response status is 409
- **And** user A's stored email is unchanged

#### New email must be verified again
- **Given** an authenticated coach whose email `ana@example.com` is verified
- **When** they PATCH `/api/auth/me` with `{"email": "ana.silva@example.com"}`
- **Then** the response is 200 with `emailVerification: "pending"` and a code is mailed to `ana.silva@example.com`
- **And** PATCHing `{"email": "ANA.silva@example.com"}` afterwards leaves the state `"pending"` and sends no second mail

#### Clearing the email clears its verification (rule 9, B-262)
- **Given** an authenticated coach whose email `rui@example.com` is verified
- **When** they PATCH `/api/auth/me` with `{"email": ""}` (or whitespace, or `null`)
- **Then** the response is 200 with `emailVerification: "unverified"` and no code is pending
- **And** a PATCH that omits `email`, or one that re-sends the same address in another case
  (`"RUI@example.com"`, any client), leaves a verified email verified and mails nothing

#### Typing before the profile has loaded keeps the other fields (rule 8, B-263)
- **Given** a coach opens Perfil and types `rui@example.com` into the email field before `GET /api/auth/me` answers
- **When** the read answers with name "Rui Costa", and the coach saves
- **Then** the name field shows "Rui Costa", the email keeps what was typed, and the save sends `{"email": "rui@example.com"}` only

#### Abbreviation falls back to initials
- **Given** an authenticated coach named "Ana Beatriz Costa" with no stored abbreviation
- **When** their profile is read
- **Then** `abbreviation` is `AB`
- **And** after they save the abbreviation "ABC", a subsequent read returns `ABC`

#### An adult edits their date of birth and country (rules 10–11)
- **Given** a student born 1990-05-01 in PT on Settings → Perfil
- **When** they change the date to 1991-06-02 and the country to ES and save
- **Then** `PATCH /api/auth/me` sends `{birthDate: "1991-06-02", country: "ES"}` and a reload shows both

#### An under-18 date is refused and nothing changes (rule 10)
- **Given** a user whose stored birth date is 1990-05-01
- **When** they PATCH `/api/auth/me` with a birth date that makes them 17 today, and a new name
- **Then** the answer is 400 `UNDERAGE` on `birthDate`, the stored birth date and name are unchanged
- **And** web and iOS show "Esta app só aceita maiores de 18 anos." under the field
- **And** `{"birthDate": ""}` and `{"birthDate": "2001-02-30"}` are 400 `INVALID_BIRTH_DATE`

### Notes
- Source: ticket PAD-81; rules 10–11 PAD-640 (privacy review D7: correction of one's own data).
- The Settings Profile panel was removed from the web UI in the App Store readiness pass (commit
  `804cf5d`) precisely because it was fake; PAD-81 rebuilds it for real rather than leaving the gap.
- Avatar upload, bio, and password change remain unbuilt — they were mocked and stay out of the UI until
  backend support exists (see `found_issues.md` item 1).
