---
id: auth.coach-approval
status: implemented
depends_on: [auth.register, auth.login]
implements: ../../specs-business/auth/newcomer-signs-up-on-their-own.business.md
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
9. Switching the gate off later: a config flag `COACH_APPROVAL_REQUIRED` (default `true`). When
   `false`, `auth.register` creates coaches as `approved` and the admin section shows nothing
   pending. No column or client change is needed to turn it off.

### Acceptance Criteria

#### Existing coaches are approved by the migration
- **Given** three Coach rows created before the migration
- **When** the migration runs
- **Then** all three have `approval_status = approved` and can use the app exactly as before

#### Superadmin lists and approves a pending coach
- **Given** coach `rui` pending and user `admin` with `is_superadmin = true`
- **When** `admin` GETs `/api/app/admin/coach-approvals`
- **Then** `rui` is listed with name, username, email and `requestedAt`
- **When** `admin` POSTs `/api/app/admin/coach-approvals/<rui.coach.id>/approve`
- **Then** `rui`'s Coach has `approval_status = approved`, `approved_by_user_id = admin.id`, and `rui`'s next `GET /api/auth/me` returns `coachApproval: "approved"`

#### Rejection stores the reason and blocks the coach
- **Given** coach `rui` pending
- **When** `admin` POSTs `.../reject` with `{"reason": "not a coach"}`
- **Then** `approval_status = rejected`, `rejection_reason = "not a coach"`, and `rui`'s `POST /api/app/club` is 403 `COACH_NOT_APPROVED`

#### Ordinary coach cannot approve
- **Given** approved coach `maria` (not superadmin) and pending coach `rui`
- **When** `maria` GETs `/api/app/admin/coach-approvals` or POSTs approve
- **Then** each response is 403 and `rui` is still `pending`

#### Invited coach is approved at creation
- **Given** a pending club invitation
- **When** a new user accepts it (`clubs.coach-invitation`, "Accept as new coach")
- **Then** the created Coach has `approval_status = approved`

#### Pending coach keeps per-user access
- **Given** pending coach `rui`
- **When** `rui` GETs `/api/auth/me` and PATCHes `{"language": "en"}`
- **Then** both succeed

#### Admin section on both platforms
- **Given** `admin` signed in on the web with one pending coach
- **When** they open Settings
- **Then** an **Admin** section is offered with a badge of 1, listing `rui` with Approve / Reject
- **And** approving removes the row; the section is absent for a non-superadmin
- **And** the same section exists on iOS

#### Approval email is branded and in the coach's language
- **Given** pending coach `rui` with `language = pt` and a captured mail transport
- **When** `admin` approves `rui`
- **Then** one mail goes to `rui@example.com` with subject `A tua conta de treinador foi aprovada`, an HTML part that contains the LevApp mark and a link to the web origin, and a text part
- **And** for a coach with `language = en` the subject is `Your coach account is approved`

#### Approval email is best-effort
- **Given** the mail transport raises
- **When** `admin` approves `rui`
- **Then** the response is still 200 and the approval is persisted

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 7.
- Mail sender: prod runs `MAIL_USERNAME=padelapp2025@gmail.com` with the `MAIL_PASSWORD` secret
  (`backend/.env.prod`, `deploy-prod.yaml`); `ADMIN_NOTIFY_EMAIL=admin@levapp.app` was added to
  `.env.prod` on 2026-09-07 (PAD-231). Staging has the same sender behind
  `MAIL_ALLOWED_RECIPIENTS=@levapp.app` (`auth.email-verification` rule 12), so an approval
  there can only ever reach the team.
- OPEN: who the LevApp admin is operationally — today the only `is_superadmin` account is the
  owner's. If a second admin is needed, flip the flag in the editor; no UI for that in v1.
- OPEN: rejected coaches keep an active User. Decide later whether rejection should disable the
  account (that would reuse `delete_account_service` and kill sessions).
