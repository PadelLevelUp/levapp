---
id: admin.approvals-and-users
status: draft
depends_on: [admin.foundation, auth.coach-approval, auth.coach-crm-sync, auth.email-verification, notifications.request-alerts, settings.role-scope]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-005, R-022, R-024]
---

# admin.approvals-and-users

> Linear: PAD-532 (this spec), epic PAD-530; builds on PAD-531 (`admin.foundation`). Owner
> decisions 2026-10-06. Draft: no code exists.

### Intent
Move coach approvals out of the coach app into the staff console with the whole existing flow
unchanged, and give staff a user directory so routine support (find, look, disable, resend
verification, see what the user sees) needs no database. The product's Settings → Admin section is
removed from web and iOS in the same ticket.

### Entities
- **READS:** Coach (`approval_status`, `requested_at` per `auth.coach-approval`), User (`name`,
  `username`, `email`, `email_verified`, `status`, `language`, `created_at`), Player, `admin_roles`
- **WRITES:** Coach and User through the existing services only (below); `admin_roles` (roles
  screen); `admin_audit_log` (every write, `admin.foundation` rule 8)
- **CREATES:** nothing new beyond `admin.foundation`'s tables

### Rules
1. **Approvals list.** `GET /admin/api/coach-approvals` (`support`) answers what
   `GET /api/app/admin/coach-approvals` answers today (`auth.coach-approval` rule 2): pending
   coaches oldest first as `{coachId, userId, name, username, email, emailVerified,
   requestedAt}`. The console shows the count in its navigation.
2. **Approve and reject reuse the services.** `POST /admin/api/coach-approvals/<coach_id>/approve`
   and `.../reject` `{reason?}` (`operator`) call `approve_coach_service` and
   `reject_coach_service` in `services/coach_approval_service.py` and nothing else, so status,
   timestamps, the branded email, the push (`notifications.request-alerts`), the CRM sync
   (`auth.coach-crm-sync`), the login disable on rejection and the 410 for a coach that is not
   `pending` behave exactly as `auth.coach-approval` rules 3, 5 and 10 say. The services' admin
   argument is the product User linked to the staff member's `admin_roles.user_id`, or none; a
   service that needs `approved_by_user_id` stores that user or null. The audit row
   (`coach.approve` / `coach.reject`) holds the staff email and `before`/`after` of
   `{approvalStatus, rejectionReason, userStatus}`, so attribution never depends on the product
   account.
3. **The signup email links to the console.** The `ADMIN_NOTIFY_EMAIL` mail
   (`auth.coach-approval` rule 4) links to the console's approvals page instead of the coach app's
   Settings.
4. **User search.** `GET /admin/api/users?q=` (`support`) matches `q` (at least 2 characters,
   case- and accent-insensitive) against name, username and email, and answers at most 50 rows
   `{userId, name, username, email, emailVerified, status, roles: [coach|player], createdAt}`
   ordered by best match then newest, with a `nextCursor` when there are more.
5. **User view.** `GET /admin/api/users/<user_id>` (`support`) answers the search row plus: coach
   approval status and clubs (for a coach), the coaches a player is linked to (for a player),
   account profiles (`auth.account-profiles`), whether a push device is registered, the product
   `is_superadmin` flag, and the user's last 20 audit rows. It never answers a password hash, a
   code, a token, a device token or a push key (the redaction list of `settings.admin-editor`
   rule 3 applies).
6. **Disable and enable.** `POST /admin/api/users/<user_id>/disable` `{reason}` and `.../enable`
   (`operator`) set `users.status` to `disabled` / `active`. Disabling uses the same state as
   account deletion and rejection, so the JWT blocklist loader refuses every product token of
   that user and they are signed out everywhere on their next request. Enabling never changes a
   coach's `approval_status`: a rejected coach is re-approved through rule 2, not here. Both are
   idempotent and audited (`user.disable` / `user.enable`, with the reason in `after`).
7. **Resend verification.** `POST /admin/api/users/<user_id>/resend-verification` (`operator`)
   sends a fresh code through the same function as `POST /api/auth/email-verification/send`
   (`auth.email-verification` rule 4), with its answers: 400 `NO_EMAIL`, 409
   `ALREADY_VERIFIED`, 429 `RESEND_TOO_SOON` with `retryAfterSeconds`. Audited
   (`user.resend_verification`).
8. **Roles screen.** The console lists active and revoked `admin_roles` rows (`support`) and lets
   the owner grant, change and revoke roles through `admin.foundation` rules 5 and 7. The user
   view links to the role row when the user's email has one.
9. **View as, read-only.** `POST /admin/api/users/<user_id>/view-as` (the `operator` role only: owner and support get 403 `ADMIN_ROLE_TOO_LOW`, an exception to the ordered matrix of `admin.foundation` rule 5) mints a product
   token for that user with claims `view_as = true`, `actor = <staff email>`, a 30-minute expiry
   and no refresh, writes an audit row `user.view_as`, and answers a URL on the product web app
   (`/view-as#<token>`) for the console to open in a new tab. Under a `view_as` token the product
   backend:
   - answers 403 `{"error": "VIEW_AS_READ_ONLY"}` to every method other than `GET`, `HEAD` and
     `OPTIONS`;
   - rolls back the request's transaction instead of committing it, so a `GET` that writes as a
     side effect (lazy instance materialisation, last-seen stamps) leaves nothing behind;
   - sends no email, push or SSE event and calls no CRM;
   - answers 403 `VIEW_AS_READ_ONLY` to every messaging read (`/api/app/conversations*`,
     messages, the messaging SSE stream): private messages are never shown;
   - is refused by `token-refresh` (no `X-New-Token`), and the token is not stored by the web
     app beyond the tab (`sessionStorage`).
   The product web app shows a fixed banner "A ver como <name> — só leitura" with a close button
   that discards the token. iOS has no view-as (a staff tool, used from the console on a desk).
10. **The product admin section leaves both apps in this ticket.** Settings → Admin is removed from
    `apps/web` (`AdminSection`, the `admin` tab of `SettingsPage`, the pending badge) and from
    `apps/mobile` (`features/settings/admin-section.tsx`, the `admin` section id); the
    `superadmin` audience of `settings.role-scope` then has no section; `GET|POST
    /api/app/admin/coach-approvals*` are removed (404); `packages/api/src/resources/admin.ts`
    loses the approval calls. The pending-coach push to superadmins
    (`notifications.request-alerts`) opens the console's approvals page instead of the app's
    Settings (`ADMIN_CONSOLE_URL` + `/approvals`). With no `ADMIN_CONSOLE_URL` the push and the alert
    mail are skipped and a warning is logged, rather than sent with a link to a page the product
    does not have (#568 review). Removed test ids are grepped out of the web E2E and Maestro flows in the same change
    (`admin-coach-approvals`, `admin-pending-*`, `admin-approve-*`, `admin-reject-*`,
    `admin-no-pending`, `admin-email-unverified-*`, `admin-reject-confirm`, `admin-reject-reason`).
10a. **Removed only when the console is live (coordinator decision 2026-10-07).** Removing the
    section leaves the console as the only way to approve a coach or flip the approval gate. The
    change therefore merges into `staging` only once the console signs in on
    `admin.staging.levapp.app`, and is promoted to production only once it signs in on
    `admin.levapp.app` (both need the owner's Google client id, the DNS records and the applied
    vhosts of `admin.foundation` rule 12).
10b. **The approval gate moves with the section.** The switch at the top of Settings → Admin moves
    to the console in this ticket, not in PAD-533, so no window exists where it can only be flipped
    in the database: `GET /admin/api/settings/coach-approval` (`support`) and
    `PUT /admin/api/settings/coach-approval` (`operator`) as `admin.clubs-and-switches` rule 4
    specifies, and `GET|PUT /api/app/admin/settings` are removed here (that spec's rule 7, first
    half). Kill-switches, clubs and courts stay in PAD-533.
10c. **The generic editor (`/editor`) is retired here (owner, 2026-10-07).** Everything reachable
    goes: the web route and page, the editor resource client in `packages/api`, and
    `EDITOR_ENABLED` from the staging template, so the editor blueprints answer 404 in every
    deployed environment. The dead backend code is deleted by PAD-550.
11. **Old clients.** An App Store build that still shows Settings → Admin gets 404 from the removed
    routes; the section shows its load-error state and nothing else breaks. No compatibility route
    is kept.

### Acceptance Criteria

#### The console lists and approves a pending coach with the full side effects (rules 1, 2)
- **Given** pending coach `rui` (`language = pt`), an `operator` token for `ana@levapp.app` with no linked product user, a captured mail transport, a stubbed push sender and a stubbed CRM client
- **When** `ana` GETs `/admin/api/coach-approvals`, then POSTs `.../<rui.coach.id>/approve`
- **Then** `rui` is listed; after approval his Coach is `approved` with `approved_by_user_id` null, one mail with subject `A tua conta de treinador foi aprovada` was sent, one approval push was sent, the CRM stub received `rui`'s status change, and one audit row `coach.approve` names `ana@levapp.app` with `before.approvalStatus = pending` and `after.approvalStatus = approved`

#### Rejection behaves as in the product (rule 2)
- **Given** pending coach `rui` signed in on the product
- **When** an operator POSTs `.../reject` `{"reason": "not a coach"}`
- **Then** the Coach is `rejected` with that reason, his User is `disabled`, his product session's next `GET /api/auth/me` is 401, and the audit row's `after` holds `{approvalStatus: rejected, rejectionReason: "not a coach", userStatus: disabled}`

#### A decided coach answers 410 (rule 2)
- **Given** approved coach `maria`
- **When** an operator POSTs `.../<maria.coach.id>/reject`
- **Then** the response is 410 and an audit row with `outcome = error` exists

#### Support cannot approve (rule 2)
- **Given** a `support` token and pending coach `rui`
- **When** it POSTs `.../approve`
- **Then** the response is 403 and `rui` is still `pending`

#### Search finds by name, username and email (rule 4)
- **Given** users `João Silva` (`joaos`, `js@example.com`) and `Joana Reis`
- **When** support GETs `/admin/api/users?q=joao`, then `?q=js@ex`, then `?q=j`
- **Then** the first answers `João Silva` (accent-insensitive) and not `Joana Reis`, the second answers `João Silva`, the third is 400

#### The user view never leaks secrets (rule 5)
- **Given** a user with a password hash, a pending verification code and a device token
- **When** support GETs `/admin/api/users/<id>`
- **Then** the body contains none of those values, and contains `emailVerified`, `status` and the device-registered flag

#### Disable signs the user out everywhere, enable lets them back (rule 6)
- **Given** player `pedro` signed in on two devices
- **When** an operator POSTs `.../disable` `{"reason": "abuse report"}`
- **Then** `pedro`'s `status = disabled`, both sessions' next request is 401, and an audit row `user.disable` holds the reason
- **When** the operator POSTs `.../enable`
- **Then** `pedro` can sign in again

#### Enable does not re-approve a rejected coach (rule 6)
- **Given** rejected coach `rui` (`users.status = disabled`)
- **When** an operator POSTs `.../enable`
- **Then** `users.status = active` and the Coach's `approval_status` is still `rejected`

#### Resend verification follows the product's limits (rule 7)
- **Given** unverified user `rita` and a captured mail transport
- **When** an operator POSTs `.../resend-verification` twice within 60 seconds
- **Then** the first is 200 and one code mail was sent; the second is 429 `RESEND_TOO_SOON` and no second mail was sent; both are audited

#### View as is read-only, leaves nothing behind and hides messages (rule 9)
- **Given** coach `maria` with a recurring class whose next instance is not yet materialised, and an operator token
- **When** the operator POSTs `/admin/api/users/<maria.id>/view-as`, and the returned token is used for the calendar read of the week holding that instance, a class-creating `POST`, `GET /api/app/conversations` and a refresh
- **Then** the view-as call wrote one audit row `user.view_as`; the calendar GET is 200 and no `LessonInstance` row was created; the POST and the conversations GET are 403 `VIEW_AS_READ_ONLY`; the response carries no `X-New-Token`; no mail, push or SSE event was emitted

#### View as is for operators only (rule 9)
- **Given** a `support` token, an `owner` token and an `operator` token
- **When** each POSTs `.../view-as`
- **Then** support and owner get 403 `ADMIN_ROLE_TOO_LOW` and no token is minted; the operator gets 200

#### Settings → Admin is gone from web and iOS (rule 10)
- **Given** a product user with `is_superadmin = true`
- **When** they open Settings on the web and on iOS
- **Then** neither shows an Admin section, and `GET /api/app/admin/coach-approvals` is 404
- **And** no web E2E spec or Maestro flow references a removed test id

#### The pending-coach push points at the console (rule 10)
- **Given** a superadmin with a registered device and a coach who self-registers
- **When** the push is built
- **Then** its target URL is the console's approvals page

#### The approval gate is in the console, not in the app (rule 10b)
- **Given** no `coach_approval_required` row and the environment default, a `support` token and an `operator` token
- **When** support GETs `/admin/api/settings/coach-approval`, support PUTs it, and the operator PUTs `{coachApprovalRequired: false}`
- **Then** the GET answers `{coachApprovalRequired: true, source: "environment"}`; support's PUT is 403; after the operator's PUT a self-registering coach is created `approved`, and one audit row `settings.coach_approval` holds `before.coachApprovalRequired = true`, `after.coachApprovalRequired = false`; `GET /api/app/admin/settings` is 404

#### The editor is unreachable (rule 10c)
- **Given** the staging env template and the web app's routes
- **When** they are read
- **Then** the template does not set `EDITOR_ENABLED`, and no web route renders `/editor`

### Not this spec
- How approval itself works (statuses, emails, the gate, re-application) — `auth.coach-approval`,
  unchanged except for where the screen lives.
- The approval gate switch (`coach_approval_required`) — `admin.clubs-and-switches`.
- Sign-in, roles, audit mechanics — `admin.foundation`.
- Editing a user's profile, classes, players or evaluations from the console.
- Deleting an account from the console (the user's own `auth.account-deletion` stays the only path).

### Notes
- Linear: PAD-532. Epic PAD-530. Depends on PAD-531.
- Service names verified in `services/coach_approval_service.py` on 2026-10-06:
  `approve_coach_service(coach_id, admin_user, now=None)`,
  `reject_coach_service(coach_id, admin_user, reason=None)`; both call the CRM sync.
- R-024: the removal ships on web and iOS together (rule 10); the console itself is web-only by
  `admin.foundation` rule 15; view-as is web-only because it is opened from the console.
- Decision 2026-10-07 (owner, coordinator defaults confirmed): the pending-coach push
  (`notifications.request-alerts`) goes to every active `admin_roles` holder with role `owner` or
  `operator` that has a linked product account (`admin_roles.user_id`); staff without a linked
  account or device are reached by the unchanged `ADMIN_NOTIFY_EMAIL` mail. During the transition
  the same list also keeps reading `is_superadmin` (on the guard's allow-list) until the console
  is live. `support` never receives it.
- Decision 2026-10-07 (owner): "view as" is for the `operator` role only, "for now just for the
  founders"; not owner, not support. Private messages are hidden entirely under view-as: the
  conversation list and bodies are not shown and the messaging surface is absent (rule 9).
- The view-as banner is the one visible product-web change this epic adds; it carries no staff
  action, only "read-only" and a close button (business rule 6 of
  `staff-act-under-the-company-identity-and-leave-a-trail` names it as the exception).
