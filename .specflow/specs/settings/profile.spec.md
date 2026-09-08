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
   hydrated from `GET /api/auth/me`, not from local defaults).
9. Saving an `email` that differs from the stored one (case-insensitively) clears `email_verified_at`,
   marks the account as needing verification and mails a 6-digit code to the new address, best-effort
   (`auth.email-verification` rules 1, 3 and 6). The response's `emailVerification` is `"pending"`
   and the client opens the code screen right after the save. Saving the same address, or clearing it,
   does not touch the verification state. The state is shown next to the field on web and iOS
   (`auth.email-verification` rule 9).

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

#### Abbreviation falls back to initials
- **Given** an authenticated coach named "Ana Beatriz Costa" with no stored abbreviation
- **When** their profile is read
- **Then** `abbreviation` is `AB`
- **And** after they save the abbreviation "ABC", a subsequent read returns `ABC`

### Notes
- Source: ticket PAD-81
- The Settings Profile panel was removed from the web UI in the App Store readiness pass (commit
  `804cf5d`) precisely because it was fake; PAD-81 rebuilds it for real rather than leaving the gap.
- Avatar upload, bio, and password change remain unbuilt — they were mocked and stay out of the UI until
  backend support exists (see `found_issues.md` item 1).
