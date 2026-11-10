---
id: auth.coach-approval
status: implemented
depends_on: [auth.register, auth.login]
serves: [P-AUTH-5]
governed_by: []
---

# auth.coach-approval

### Intent
For now, a coach who signs up on their own does not get coach powers until a LevApp admin says
yes. The account exists and can sign in, but everything club-scoped is closed until approval. This
is the gate the owner asked for on 2026-09-06 while LevApp is still onboarding coaches by hand;
it is designed to be switched off later without a data change.

### Entities
- **WRITES:** Coach — new columns `approval_status` (`pending`|`approved`|`rejected`,
  server default `pending`), `approved_at`, `approved_by_user_id` (FK → users, SET NULL),
  `rejection_reason` (text, nullable). Migration backfills every existing Coach to `approved`.
- **READS:** User (`is_superadmin`), Coach

### Rules
1. Only self-registration (`auth.register`) creates a `pending` coach. A coach created by
   accepting a club invitation (`clubs.coach-invitation`) is `approved` at creation — an existing
   club member vouched for them. Coaches created in the backend editor are `approved`.
2. `GET /api/app/admin/coach-approvals` — caller must be `is_superadmin` (403 otherwise,
   including for ordinary coaches). Lists coaches with `approval_status = pending` as
   `{coachId, userId, name, username, email, emailVerified, requestedAt}`, oldest first
   (`emailVerified` per `auth.email-verification` rule 10).
3. `POST /api/app/admin/coach-approvals/<coach_id>/approve` and `.../reject` `{reason?}` —
   superadmin only. Approve sets `approved`, `approved_at`, `approved_by_user_id`. Reject sets
   `rejected` and stores the reason (never shown to the coach in v1). A coach that is not
   `pending` is 410. Both are idempotent for the same target state.
4. On signup, if `ADMIN_NOTIFY_EMAIL` is configured, one email is sent to it via
   `email_tools.send_email` with the coach's name, username, email, whether that email is
   verified, and a link to the admin screen; if not configured, nothing is sent and the badge
   (rule 7) is the only signal. Sending failure is logged and never fails the signup.
5. On approval, if the coach has an email, one email tells them they can start (best-effort, same
   failure rule). It is rendered by `padel_app/tools/email_templates.py` in the coach's
   `language`: subject `A tua conta de treinador foi aprovada` / `Your coach account is
   approved`, branded HTML (LevApp mark, one primary button "Abrir a LevApp" pointing at
   `PUBLIC_WEB_ORIGIN` or `https://levapp.app`, what happens next: create or join your club) and a
   plain-text alternative. Nothing is sent on rejection in v1.
6. **Coach-side screens** (web and iOS): `pending` → "Waiting for LevApp approval" (name of the
   account, what happens next, Sign out); `rejected` → "Your request was not approved" with the
   support link (`/support`) and Sign out. Neither screen offers any club or roster action. The
   routing rule is `auth.register` rule 11.
7. **Admin surface**: Settings gains an **Admin** section visible only when `isSuperAdmin`
   (`settings.role-scope` — a new section id, hidden for everyone else, endpoints guarded server
   side by rule 2). It lists pending coaches with Approve / Reject and shows a count badge. Web
   and iOS.
8. **Enforcement**: `require_coach()` is extended — after resolving the coach it aborts 403
   `{"error": "COACH_NOT_APPROVED"}` unless `approval_status = approved`. Per-user endpoints
   (`/api/auth/me`, `PATCH /api/auth/me`, `DELETE /api/auth/me`, `/api/auth/logout`) stay open.
   `POST /api/app/club` and `POST /api/app/club/<id>/join-requests` go through `require_coach()`
   so a pending coach can neither create nor request a club.
9. **Switching the gate off is an admin setting (PAD-238 item 3, shipped by PAD-279).** The
   `app_settings` table holds `coach_approval_required` (JSON value, `updated_at`,
   `updated_by_user_id`). `auth.register` reads it through `app_settings_service`: a stored row
   wins; with no row the process falls back to the `COACH_APPROVAL_REQUIRED` env flag (default
   `true`), so an environment that never touched the setting behaves as before. When the gate is
   off, coaches are created `approved` and the admin section shows nothing pending. The superadmin
   reads and flips it with `GET|PUT /api/app/admin/settings` (`{coachApprovalRequired, source}`,
   `source` = `database` | `environment`; 403 for anyone else) from a switch at the top of the
   Settings → Admin section, on web and iOS. Flipping it never changes an existing coach's
   `approval_status`.
10. **Rejection disables the login (PAD-233, owner decision 2026-09-09).** `reject` also sets
    the coach's `users.status` to `disabled`. The JWT blocklist loader already refuses every
    token of a `disabled` user, so the coach is signed out on every device at once (the next
    request answers 401 and the clients drop the session) and nothing club-scoped is reachable.
    No new column: `disabled` is the same state account deletion uses, and the coach row keeps
    `approval_status = rejected` plus `rejection_reason`.
11. **Login says why.** `POST /api/auth/login` with the right credentials for a user whose coach
    is `rejected` answers 403 `{"error": "COACH_REJECTED", "reason": "<rejection_reason or
    null>"}` and issues no token. The reason the admin typed IS shown to the coach from now on
    (rule 3's "never shown in v1" is superseded). Wrong credentials stay 401 so the status leaks
    nothing to a guesser.
12. **Re-application.** `POST /api/auth/coach-approval/reapply` `{"username", "password"}` (no
    JWT — the coach cannot sign in) checks the credentials (401 on a mismatch), requires the
    coach to be `rejected` (410 otherwise, including for a deleted account, which has no email),
    then sets `approval_status = pending`, clears `rejection_reason`, sets `users.status` back to
    `active`, notifies the admin exactly as signup does (rule 4) and answers 200 with the login
    body (`accessToken` + `user`), so the client signs the coach in and lands them on the
    "Waiting for LevApp approval" screen (rule 6). The admin sees them in the pending list again.
13. **Login screens (web and iOS).** On a 403 `COACH_REJECTED` the login form shows, in place of
    the generic failure toast, a "Pedido não aprovado" block with the reason when there is one
    and a **Pedir nova aprovação** button that calls rule 12 with the credentials already typed;
    on success the app routes exactly as a fresh login. The in-app rejected screen of rule 6 stays
    for a session that was open at the moment of rejection but is normally never reached again.

### Acceptance Criteria

#### AUTH-COACH-APPROVAL-1: Existing coaches are approved by the migration
- **Given** three Coach rows created before the migration
- **When** the migration runs
- **Then** all three have `approval_status = approved` and can use the app exactly as before

#### AUTH-COACH-APPROVAL-2: Superadmin lists and approves a pending coach
- **Given** coach `rui` pending and user `admin` with `is_superadmin = true`
- **When** `admin` GETs `/api/app/admin/coach-approvals`
- **Then** `rui` is listed with name, username, email and `requestedAt`
- **When** `admin` POSTs `/api/app/admin/coach-approvals/<rui.coach.id>/approve`
- **Then** `rui`'s Coach has `approval_status = approved`, `approved_by_user_id = admin.id`, and `rui`'s next `GET /api/auth/me` returns `coachApproval: "approved"`

#### AUTH-COACH-APPROVAL-3: Rejection stores the reason and blocks the coach
- **Given** coach `rui` pending
- **When** `admin` POSTs `.../reject` with `{"reason": "not a coach"}`
- **Then** `approval_status = rejected`, `rejection_reason = "not a coach"`, and `rui`'s `POST /api/app/club` with the token from before the rejection is 401 (rule 10 killed the session; before PAD-233 it was 403 `COACH_NOT_APPROVED`)

#### AUTH-COACH-APPROVAL-4: Rejection signs the coach out everywhere (PAD-233)
- **Given** pending coach `rui` signed in on two devices
- **When** `admin` POSTs `.../reject` with `{"reason": "not a coach"}`
- **Then** `rui`'s User has `status = disabled`, and both devices' next `GET /api/auth/me` is 401

#### AUTH-COACH-APPROVAL-5: Login tells a rejected coach why (PAD-233)
- **Given** rejected coach `rui` (reason "not a coach")
- **When** `rui` POSTs `/api/auth/login` with the right password
- **Then** the response is 403 `{"error": "COACH_REJECTED", "reason": "not a coach"}` with no `accessToken`
- **When** `rui` POSTs with a wrong password
- **Then** the response is 401 with no reason

#### AUTH-COACH-APPROVAL-6: A rejected coach can ask again (PAD-233)
- **Given** rejected coach `rui` and `ADMIN_NOTIFY_EMAIL` configured with a captured transport
- **When** `rui` POSTs `/api/auth/coach-approval/reapply` with the right password
- **Then** the response is 200 with an `accessToken`, the Coach is `pending` with `rejection_reason` null, the User is `active`, one admin mail was sent, and `admin`'s pending list contains `rui`
- **When** `rui` POSTs `reapply` again while pending
- **Then** the response is 410
- **When** anyone POSTs `reapply` with a wrong password
- **Then** the response is 401 and nothing changes

#### AUTH-COACH-APPROVAL-7: Login screen offers "request again" (PAD-233)
- **Given** a rejected coach on the web `/auth` or the iOS login screen
- **When** they sign in with the right password
- **Then** the form shows "Pedido não aprovado" with the reason and a **Pedir nova aprovação** button, and no dashboard is shown
- **When** they tap it
- **Then** they land on "Waiting for LevApp approval", and Settings → Admin lists them for the superadmin

#### AUTH-COACH-APPROVAL-8: Ordinary coach cannot approve
- **Given** approved coach `maria` (not superadmin) and pending coach `rui`
- **When** `maria` GETs `/api/app/admin/coach-approvals` or POSTs approve
- **Then** each response is 403 and `rui` is still `pending`

#### AUTH-COACH-APPROVAL-9: Invited coach is approved at creation
- **Given** a pending club invitation
- **When** a new user accepts it (`clubs.coach-invitation`, "Accept as new coach")
- **Then** the created Coach has `approval_status = approved`

#### AUTH-COACH-APPROVAL-10: Pending coach keeps per-user access
- **Given** pending coach `rui`
- **When** `rui` GETs `/api/auth/me` and PATCHes `{"language": "en"}`
- **Then** both succeed

#### AUTH-COACH-APPROVAL-11: Admin section on both platforms
- **Given** `admin` signed in on the web with one pending coach
- **When** they open Settings
- **Then** an **Admin** section is offered with a badge of 1, listing `rui` with Approve / Reject
- **And** approving removes the row; the section is absent for a non-superadmin
- **And** the same section exists on iOS

#### AUTH-COACH-APPROVAL-12: Admin switches the approval gate off and on (PAD-238, PAD-279)
- **Given** `admin` signed in on the web, no `app_settings` row and the env flag at its default
- **When** they open Settings → Admin
- **Then** the "New coaches need approval" switch is on and reads its value from the environment
- **When** they switch it off
- **Then** `GET /api/app/admin/settings` answers `{coachApprovalRequired: false, source: "database"}` and a coach who registers now is created `approved` and lands on the club step
- **When** they switch it back on
- **Then** the next self-registered coach is `pending` again
- **And** an ordinary coach gets 403 on both endpoints and never sees the switch
- **And** the same switch exists on iOS
- **Given** pending coach `rui` with `language = pt` and a captured mail transport
- **When** `admin` approves `rui`
- **Then** one mail goes to `rui@example.com` with subject `A tua conta de treinador foi aprovada`, an HTML part that contains the LevApp mark and a link to the web origin, and a text part
- **And** for a coach with `language = en` the subject is `Your coach account is approved`

#### AUTH-COACH-APPROVAL-13: Approval email is best-effort
- **Given** the mail transport raises
- **When** `admin` approves `rui`
- **Then** the response is still 200 and the approval is persisted

#### AUTH-COACH-APPROVAL-14: The admin is emailed on a coach's sign-up only when an address is configured (rule 4)
- **Given** `ADMIN_NOTIFY_EMAIL` unset
- **When** a coach registers
- **Then** no mail goes to an admin address
- **And** with it set, exactly one mail goes to that address for the next coach who registers
test: `backend/padel_app/tests/test_coach_approval.py` › `test_admin_notified_on_signup_only_when_configured`

#### AUTH-COACH-APPROVAL-15: The approval mail is branded, in the coach's language, and its button opens the sign-in page (rule 5)
- **Given** a pending coach with an email and `language` `pt`
- **When** staff approve the coach
- **Then** one mail goes to the coach with the subject `A tua conta de treinador foi aprovada`, an HTML part carrying the LevApp mark, and a text part
- **And** a coach whose language is `en` gets `Your coach account is approved`
- **And** the button and the text link point at `/auth` on `PUBLIC_WEB_ORIGIN`, or on `https://levapp.app` when none is configured; a configured origin leaves no production link in the mail
test: `backend/padel_app/tests/test_coach_approval.py` › `test_coach_is_emailed_on_approval` (+3 more)

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 7.
- Mail sender: prod runs `MAIL_USERNAME=admin@levapp.app` and sends as
  `MAIL_DEFAULT_SENDER=noreply@levapp.app` with the `MAIL_PASSWORD` secret (a Google app
  password; `backend/.env.prod`, `deploy-prod.yaml`; the personal Gmail was retired by
  `a3dcc2fe5`, PAD-187 step 3); `ADMIN_NOTIFY_EMAIL=admin@levapp.app` was added to
  `.env.prod` on 2026-09-07 (PAD-231). Staging has the same sender behind
  `MAIL_ALLOWED_RECIPIENTS=@levapp.app` (`auth.email-verification` rule 12), so an approval
  there can only ever reach the team.
- Superadmins also get a native push for a pending coach, and the coach a push on approval:
  `notifications.request-alerts` (PAD-232).
- Decision 2026-10-07 (owner): the approving staff are the `owner` and `operator` roles of
  `admin.foundation` (`support` cannot approve); the pending-coach push goes to all of them. The
  `/editor` data browser that used to flip `is_superadmin` is retired; roles are granted in the
  console (`admin.foundation` rule 7).
- Decision 2026-09-09 (owner, PAD-233): rejection disables the login (rules 10–13) and the
  coach may ask again. The `disabled` status is reused rather than a new column so no migration
  was needed; a deleted account cannot re-apply because deletion clears the email.
- **Surface moving (2026-10-06, PAD-532, draft):** the approving surface of rules 2, 3, 7 and 9
  (Settings → Admin and `/api/app/admin/*`) moves to the staff console and is removed from web
  and iOS; the approval rules themselves are unchanged and the console calls the same services.
  See `admin.approvals-and-users` (approvals) and `admin.clubs-and-switches` rule 4 (the gate).
  Until that ships, the rules above describe production.

### Open questions

- **Rules 2, 3, 7 and 9 and criteria 2, 3, 8, 11 and 12 describe the product's Admin section, which PAD-532 removed.**
  - Spec: rule 2, "`GET /api/app/admin/coach-approvals` — caller must be `is_superadmin` (403
    otherwise…)"; rule 7, "Settings gains an **Admin** section … Web and iOS"; rule 9, "`GET|PUT
    /api/app/admin/settings`"; AUTH-COACH-APPROVAL-8, "each response is 403";
    AUTH-COACH-APPROVAL-12, "an ordinary coach gets 403 on both endpoints". Notes: "Until that
    ships, the rules above describe production."
  - Other spec: `admin.approvals-and-users` rules 1, 2, 10 and 10b moved the list, the decisions
    and the gate to the staff console and removed Settings → Admin from web and iOS.
  - Code today: it shipped. `modules/frontend_api.py` says "`/api/app/admin/*` is gone (404), with
    no compatibility route". `test_pad238_app_settings.py` ›
    `test_a_support_role_reads_but_cannot_flip_and_the_product_route_is_gone` and
    `test_coach_approval.py` › `test_student_cannot_approve` get 404 on the product routes and
    401 on the console for a product token.
  - Recommendation: keep here what a coach lives through (rules 1, 4 to 6, 8, 10 to 13) and point
    the staff side at `admin.approvals-and-users`.
  - Proposed: rules 2, 3 and 7 become one line, "Staff list, approve and reject pending coaches in
    the staff console (`admin.approvals-and-users` rules 1 and 2); the product has no admin route
    or screen." Rule 9 keeps the `app_settings` fallback and says the switch is
    `admin.approvals-and-users` rule 10b. Criteria 2, 3, 8, 11 and 12: retire in favour of
    ADMIN-APPROVALS-AND-USERS-1 to -4, -12 and -14. Drop the note's last sentence.
- **Rule 5 sends the approval mail's button to the site root; the code sends it to `/auth`.**
  - Spec: rule 5, "one primary button "Abrir a LevApp" pointing at `PUBLIC_WEB_ORIGIN` or
    `https://levapp.app`".
  - Code today: `tools/email_templates.py` builds `href = f"{web_origin()}/auth"`, because an
    approved coach still has to sign in and a universal link opens the app at the path it is given.
    `test_email_templates_brand.py` › `test_the_approval_button_goes_to_sign_in` proves it
    (AUTH-COACH-APPROVAL-15).
  - Recommendation: amend the rule to the code.
  - Proposed text: "…one primary button "Abrir a LevApp" pointing at `/auth` on `PUBLIC_WEB_ORIGIN`
    or on `https://levapp.app`…".
- **AUTH-COACH-APPROVAL-12 ends with a block about the approval mail.** Its last Given/When/Then
  (a pending coach with `language = pt` … the subject in each language) belongs to rule 5, not to
  the gate. AUTH-COACH-APPROVAL-15 now states it. Recommendation: remove that block from -12.
