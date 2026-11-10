---
id: admin.approvals-and-users
status: draft
depends_on: [admin.foundation, auth.coach-approval, auth.coach-crm-sync, auth.email-verification, notifications.request-alerts, settings.role-scope]
serves: [P-ADMIN-3]
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
   code, a token, a device token or a push key: never `users.password`, `users.generated_code`,
   `users.email_verification_code_hash`, `users.password_reset_code_hash`, `device_tokens.token`,
   `push_subscriptions.subscription_json` or any invitation / join token (the list
   `settings.admin-editor` rule 3 kept until PAD-550 deleted that editor; the user view builds its
   own field list and never reads those columns).
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
   - also hides message text wherever another GET carries it: the dashboard's messages overview
     answers no counts and no latest, and the "needs you" block has no reply items (a guard calls
     every product GET in the URL map under view-as and fails on a seeded sentinel message);
   - ends on the next request when its actor is no longer an active `operator` (401
     `VIEW_AS_REVOKED`), not 30 minutes later.
   A staff account is never viewed as: a product superadmin, or an account whose email holds an
   active console role, answers 403 `VIEW_AS_TARGET_STAFF` (#584 review, 2026-10-08).
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
    deployed environment. PAD-550 then deleted the backend code (the three editor blueprints, the
    `EDITOR_ENABLED` switch, the `MODELS` registry, the editor templates and helpers); the E2E and
    Maestro suites clean up through the E2E-only `/api/app/notify/debug/rows` routes instead.
11. **Old clients.** An App Store build that still shows Settings → Admin gets 404 from the removed
    routes; the section shows its load-error state and nothing else breaks. No compatibility route
    is kept.

### Acceptance Criteria

#### ADMIN-APPROVALS-AND-USERS-1: The console lists and approves a pending coach with the full side effects (rules 1, 2)
- **Given** pending coach `rui` (`language = pt`), an `operator` token for `ana@levapp.app` with no linked product user, a captured mail transport, a stubbed push sender and a stubbed CRM client
- **When** `ana` GETs `/admin/api/coach-approvals`, then POSTs `.../<rui.coach.id>/approve`
- **Then** `rui` is listed; after approval his Coach is `approved` with `approved_by_user_id` null, one mail with subject `A tua conta de treinador foi aprovada` was sent, one approval push was sent, the CRM stub received `rui`'s status change, and one audit row `coach.approve` names `ana@levapp.app` with `before.approvalStatus = pending` and `after.approvalStatus = approved`

#### ADMIN-APPROVALS-AND-USERS-2: Rejection behaves as in the product (rule 2)
- **Given** pending coach `rui` signed in on the product
- **When** an operator POSTs `.../reject` `{"reason": "not a coach"}`
- **Then** the Coach is `rejected` with that reason, his User is `disabled`, his product session's next `GET /api/auth/me` is 401, and the audit row's `after` holds `{approvalStatus: rejected, rejectionReason: "not a coach", userStatus: disabled}`

#### ADMIN-APPROVALS-AND-USERS-3: A decided coach answers 410 (rule 2)
- **Given** approved coach `maria`
- **When** an operator POSTs `.../<maria.coach.id>/reject`
- **Then** the response is 410 and an audit row with `outcome = error` exists

#### ADMIN-APPROVALS-AND-USERS-4: Support cannot approve (rule 2)
- **Given** a `support` token and pending coach `rui`
- **When** it POSTs `.../approve`
- **Then** the response is 403 and `rui` is still `pending`

#### ADMIN-APPROVALS-AND-USERS-5: Search finds by name, username and email (rule 4)
- **Given** users `João Silva` (`joaos`, `js@example.com`) and `Joana Reis`
- **When** support GETs `/admin/api/users?q=joao`, then `?q=js@ex`, then `?q=j`
- **Then** the first answers `João Silva` (accent-insensitive) and not `Joana Reis`, the second answers `João Silva`, the third is 400

#### ADMIN-APPROVALS-AND-USERS-6: The user view never leaks secrets (rule 5)
- **Given** a user with a password hash, a pending verification code and a device token
- **When** support GETs `/admin/api/users/<id>`
- **Then** the body contains none of those values, and contains `emailVerified`, `status` and the device-registered flag

#### ADMIN-APPROVALS-AND-USERS-7: Disable signs the user out everywhere, enable lets them back (rule 6)
- **Given** player `pedro` signed in on two devices
- **When** an operator POSTs `.../disable` `{"reason": "abuse report"}`
- **Then** `pedro`'s `status = disabled`, both sessions' next request is 401, and an audit row `user.disable` holds the reason
- **When** the operator POSTs `.../enable`
- **Then** `pedro` can sign in again

#### ADMIN-APPROVALS-AND-USERS-8: Enable does not re-approve a rejected coach (rule 6)
- **Given** rejected coach `rui` (`users.status = disabled`)
- **When** an operator POSTs `.../enable`
- **Then** `users.status = active` and the Coach's `approval_status` is still `rejected`

#### ADMIN-APPROVALS-AND-USERS-9: Resend verification follows the product's limits (rule 7)
- **Given** unverified user `rita` and a captured mail transport
- **When** an operator POSTs `.../resend-verification` twice within 60 seconds
- **Then** the first is 200 and one code mail was sent; the second is 429 `RESEND_TOO_SOON` and no second mail was sent; both are audited

#### ADMIN-APPROVALS-AND-USERS-10: View as is read-only, leaves nothing behind and hides messages (rule 9)
- **Given** coach `maria` with a recurring class whose next instance is not yet materialised, and an operator token
- **When** the operator POSTs `/admin/api/users/<maria.id>/view-as`, and the returned token is used for the calendar read of the week holding that instance, a class-creating `POST`, `GET /api/app/conversations` and a refresh
- **Then** the view-as call wrote one audit row `user.view_as`; the calendar GET is 200 and no `LessonInstance` row was created; the POST and the conversations GET are 403 `VIEW_AS_READ_ONLY`; the response carries no `X-New-Token`; no mail, push or SSE event was emitted

#### ADMIN-APPROVALS-AND-USERS-11: View as is for operators only (rule 9)
- **Given** a `support` token, an `owner` token and an `operator` token
- **When** each POSTs `.../view-as`
- **Then** support and owner get 403 `ADMIN_ROLE_TOO_LOW` and no token is minted; the operator gets 200

#### ADMIN-APPROVALS-AND-USERS-12: Settings → Admin is gone from web and iOS (rule 10)
- **Given** a product user with `is_superadmin = true`
- **When** they open Settings on the web and on iOS
- **Then** neither shows an Admin section, and `GET /api/app/admin/coach-approvals` is 404
- **And** no web E2E spec or Maestro flow references a removed test id

#### ADMIN-APPROVALS-AND-USERS-13: The pending-coach push points at the console (rule 10)
- **Given** a superadmin with a registered device and a coach who self-registers
- **When** the push is built
- **Then** its target URL is the console's approvals page

#### ADMIN-APPROVALS-AND-USERS-14: The approval gate is in the console, not in the app (rule 10b)
- **Given** no `coach_approval_required` row and the environment default, a `support` token and an `operator` token
- **When** support GETs `/admin/api/settings/coach-approval`, support PUTs it, and the operator PUTs `{coachApprovalRequired: false}`
- **Then** the GET answers `{coachApprovalRequired: true, source: "environment"}`; support's PUT is 403; after the operator's PUT a self-registering coach is created `approved`, and one audit row `settings.coach_approval` holds `before.coachApprovalRequired = true`, `after.coachApprovalRequired = false`; `GET /api/app/admin/settings` is 404

#### ADMIN-APPROVALS-AND-USERS-15: The editor is gone (rule 10c, PAD-550)
- **Given** the backend app and the web app's routes
- **When** `/editor/`, `/api/editor/models` and `/api/query/user` are requested and the routes are read
- **Then** each answers 404 in every environment (no `EDITOR_ENABLED` switch exists), and no web route
  renders `/editor`

#### ADMIN-APPROVALS-AND-USERS-16: The approvals page lists, decides and says what happened (rules 1, 2)
- **Given** an operator on `/approvals` with one pending coach whose email is not verified
- **Then** the row shows the coach's name and the unverified mark
- **When** they approve
- **Then** the approve request is sent and the list is fetched again
- **And** rejecting sends the typed reason as `{"reason": <text>}`
- **And** a 410 on a decision, whatever its body, shows that the coach was already decided and fetches the list again
- **And** support sees the list with no approve and no reject button
test: `frontend/apps/admin/src/pages/operations.test.tsx` › `lists the pending coach; an operator approves and the list refetches` (+3 more)

#### ADMIN-APPROVALS-AND-USERS-17: User search answers 50 at a time and continues by cursor (rule 4)
- **Given** 55 users matching `pager`
- **When** support GETs `/admin/api/users?q=pager`, then the same with the answer's `nextCursor`
- **Then** the first answer holds 50 users and a cursor, the second the other 5 and no cursor, and no user is in both
- **And** a cursor that is not one the server issued answers 400 `{"error": "BAD_CURSOR"}`
- **And** on the page each result links to `/users/<id>`, "more" asks with the cursor and disappears at the end, and a `QUERY_TOO_SHORT` answer shows that two characters are needed
test: `frontend/apps/admin/src/pages/operations.test.tsx` › `a 1-character query shows the too-short message` (+3 more)

#### ADMIN-APPROVALS-AND-USERS-18: The user page disables with a reason, says when a resend is too soon, and offers support nothing (rules 5, 6, 7)
- **Given** an operator on an active user's page
- **When** they choose to disable
- **Then** the confirmation stays disabled until a reason is typed, the request carries `{"reason": <text>}`, and the user is fetched again
- **And** a resend answered 429 `RESEND_TOO_SOON` shows the seconds to wait from `retryAfterSeconds`
- **And** support sees the account's details with no disable, enable or resend button
test: `frontend/apps/admin/src/pages/operations.test.tsx` › `disable needs a reason and POSTs it` (+2 more)

#### ADMIN-APPROVALS-AND-USERS-19: View as opens a read-only tab kept apart from the normal session (rule 9)
- **Given** an operator on a user's page in the console
- **When** they press "view as"
- **Then** the console posts to that user's `view-as` route and opens the answered URL in a new tab that has no opener; the button is not shown to the owner or to support
- **When** the web app opens on `/view-as#<token>`
- **Then** it takes the token from the fragment and keeps it for this tab only: the stored normal session is neither replaced nor refreshed, and leaving view-as gives the normal session back
- **And** a banner names the viewed user, says read-only and holds one button; an ordinary session shows no banner
test: `frontend/apps/admin/src/pages/UserPage.viewAs.test.tsx` › `an operator opens a read-only tab on the product` (+7 more)

#### ADMIN-APPROVALS-AND-USERS-20: A view-as token is short-lived, tied to its operator and never minted for staff (rule 9)
- **Given** an operator and a product user
- **When** the operator POSTs `/admin/api/users/<id>/view-as`
- **Then** the answer's `url` is the product web origin's `/view-as#<token>`; the token is a product token for that user with `view_as` true, the operator's email as `actor` and under 30 minutes to live; one `user.view_as` audit row is written
- **And** once the operator's role is revoked or is no longer `operator`, the token's next request answers 401 (`VIEW_AS_REVOKED` when the role changed)
- **And** a target who is a product superadmin, or who holds an active console role, is refused with 403 `VIEW_AS_TARGET_STAFF`
test: `backend/padel_app/tests/test_pad532_view_as.py` › `test_view_as_mints_a_short_read_only_token_and_is_audited` (+2 more)

#### ADMIN-APPROVALS-AND-USERS-21: A console write whose audit row cannot be written sends nothing (admin.foundation rule 8)
- **Given** the audit insert failing
- **When** an operator approves a pending coach, or resends a user's verification code
- **Then** the answer is 500, the coach is still pending and the user's code time is unchanged, and no email, push or CRM sync went out
test: `backend/padel_app/tests/test_pad532_approvals.py` › `test_side_effects_wait_for_the_audit_commit` (+1 more)

#### ADMIN-APPROVALS-AND-USERS-22: Without a console URL no pending-coach alert carries a broken link (rules 3, 10)
- **Given** `ADMIN_CONSOLE_URL` empty and `ADMIN_NOTIFY_EMAIL` set
- **When** a coach registers and is pending
- **Then** no push is sent, the only email goes to `ADMIN_NOTIFY_EMAIL` and holds no `/approvals` path, and a warning naming `ADMIN_CONSOLE_URL` is logged
test: `backend/padel_app/tests/test_pad532_approvals.py` › `test_no_console_url_means_no_wrong_link`

#### ADMIN-APPROVALS-AND-USERS-23: The user view shows the account's audit trail and its console role (rule 5)
- **Given** a coach an operator approved, and a user with an active `support` role who was disabled
- **When** an operator GETs each user
- **Then** the first's `audit` holds the `coach.approve` row, and the second's holds its `user.disable` row and `adminRole.role` is `support`
test: `backend/padel_app/tests/test_pad532_users.py` › `test_a_coach_view_lists_its_approval_rows` (+1 more)

#### ADMIN-APPROVALS-AND-USERS-24: The E2E clean-up routes work only behind the E2E flag and a session, on allow-listed tables (rule 10c)
- **Given** `E2E_DEBUG_ENDPOINTS` on and a signed-in user
- **When** they GET `/api/app/notify/debug/rows/club`, then DELETE one of the ids twice
- **Then** the ids are listed, the first delete answers 200, the second 404, and the other rows stay
- **And** `user`, `coach`, `tokenblocklist` and `adminrole` answer 404 on both verbs and lose no row
- **And** with no session the answer is 401, and with the flag off every such route is 404
test: `backend/padel_app/tests/test_pad550_e2e_cleanup_rows.py` › `test_off_the_flag_both_routes_are_404` (+3 more)

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

### Open questions

- **Rule 6 says enable sets the status to `active`; the code enables only a disabled account.**
  - Spec: rule 6, "`…/disable` `{reason}` and `…/enable` (`operator`) set `users.status` to
    `disabled` / `active`".
  - Test: `test_pad532_users.py` › `test_enable_only_undoes_a_disable`
    posts `enable` for an `inactive` user and asserts 200 with the status still `inactive`.
  - Code today: `services/admin/users_service.py` `enable` sets `active` only when the status is
    `disabled` ("Rule 6 undoes a disable, nothing else"): an account a coach created and its
    owner never activated stays inactive. The audit row is written either way.
  - Recommendation: keep the code and amend the rule; activating a never-activated account from
    the console would skip the student's own activation.
  - Proposed text for rule 6: "…`enable` sets a `disabled` account back to `active` and leaves
    any other status as it is". Proposed criterion: "Given an `inactive` user, When an operator
    POSTs `…/enable`, Then the answer is 200 and the status is still `inactive`."
