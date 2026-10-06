---
id: admin.foundation
status: draft
depends_on: [auth.login, auth.token-refresh]
implements: ../../specs-business/admin/staff-act-under-the-company-identity-and-leave-a-trail.business.md
governed_by: [R-005, R-022, R-023, R-024, R-036]
---

# admin.foundation

> Linear: PAD-531 (this spec), epic PAD-530. Owner decisions 2026-10-06. Draft: no code exists.
> Every other `admin.*` leaf builds on this one.

### Intent
Stand up the staff console as its own service: a separate web app at `admin.levapp.app`, a backend
blueprint under `/admin/api/*`, staff sign-in through Google restricted to the company Workspace
domain, a token that only works on the console, three roles, and an audit row for every write.
Today the only staff power is the `users.is_superadmin` flag, exercised from inside the coach app
(Settings → Admin, the `/editor` page) with no record of who changed what.

### Surfaces
- **Web app** `frontend/apps/admin` — React + Vite, an npm workspace beside `apps/web`, may use
  `@levelup/*` packages (ui, i18n, shared types). Served at `admin.levapp.app` (prod) and
  `admin.staging.levapp.app` (staging).
- **Backend** — one blueprint, `admin_api`, `url_prefix="/admin/api"`, registered in
  `modules/__init__.py` in every environment, in the existing backend container. Services live in
  `padel_app/services/admin/` (R-005); responses are camelCase (R-022); times are UTC (R-023).

### Entities
- **CREATES:** `admin_roles` — `id`, `email` (String(254), unique, stored lower-cased), `role`
  (`owner`|`operator`|`support`), `user_id` (FK → users, SET NULL, nullable: the product account
  with the same email, when one exists), `granted_by_email` (nullable for seeded rows),
  `granted_at`, `revoked_at` (nullable), `created_at`, `updated_at`. A row is active while
  `revoked_at` is null.
- **CREATES:** `admin_audit_log` — `id`, `created_at`, `actor_email`, `actor_role`, `action`
  (dotted verb, e.g. `coach.approve`), `target_type`, `target_id` (string, nullable), `before`
  (JSON, nullable), `after` (JSON, nullable), `request_id`, `outcome` (`ok`|`denied`|`error`).
  Append-only.
- **READS:** User (`email`, `is_superadmin` for the seed only).
- `users.is_superadmin` is not dropped and keeps working for the code that reads it today. New code
  never reads it; it is retired once nothing reads it (rule 6).

### Rules
1. **Sign-in is Google only.** The console uses Google Identity Services in the browser to obtain
   a Google ID token and posts it to `POST /admin/api/auth/google` `{credential}`. The backend
   verifies it with `google-auth` against `ADMIN_GOOGLE_CLIENT_ID` and accepts it only when all
   hold: the signature and expiry are valid, `email_verified` is true, the `hd` claim is
   `levapp.app`, and the email ends with `@levapp.app`. Otherwise it answers 403
   `{"error": "NOT_STAFF_DOMAIN"}`. There is no console password, no password reset and no
   sign-up.
2. **A domain account still needs a role.** A verified `@levapp.app` email with no active
   `admin_roles` row answers 403 `{"error": "NO_ADMIN_ROLE"}`. Both refusals write an audit row
   (`action = auth.sign_in`, `outcome = denied`, `actor_email` = the email Google asserted, or
   `unknown` when the token did not verify).
3. **The admin token is a separate audience.** On success the backend issues a JWT with
   `aud = "levapp-admin"`, `sub` = the `admin_roles.id`, a `role` claim, an `email` claim and an
   expiry of 12 hours. There is no silent refresh; after 12 hours the staff member signs in with
   Google again. Every `/admin/api/*` route except `auth/google` requires a token whose `aud` is
   `levapp-admin` and answers 401 `{"error": "ADMIN_TOKEN_REQUIRED"}` for a missing token or any
   other token, a product token included. Every product route (`/api/*`, `/auth/*`, the SSE
   stream) answers 401 for a token whose `aud` is `levapp-admin`. Product tokens keep their
   current shape (no `aud`), so no product session is affected.
4. **The role is read on every request.** The token's `role` claim is only a hint for the UI; the
   backend loads the `admin_roles` row by `sub` on each request and answers 401 when the row is
   missing or revoked, so revoking a role ends that person's access on their next request.
   `POST /admin/api/auth/logout` adds the token's `jti` to `token_blocklist`.
5. **Role matrix.** Each route declares the lowest role it needs; the order is
   `support < operator < owner`. A request below the route's role answers 403
   `{"error": "ADMIN_ROLE_TOO_LOW"}` and writes an audit row with `outcome = denied`.
   - `support`: every `GET` route. No write of any kind.
   - `operator`: everything `support` can do, plus every write except role management.
   - `owner`: everything, plus `POST|DELETE /admin/api/roles/*` (grant, change, revoke a role).
6. **`admin_roles` replaces `is_superadmin` for new code.** The migration creates both tables and
   seeds one `owner` row for `admin@levapp.app` and one `owner` row for the email of every user
   with `is_superadmin = true` (deduplicated, lower-cased), with `granted_by_email` null. A seeded
   email outside `@levapp.app` can never sign in (rule 1); it is kept so the owner sees it and
   revokes it. No new code checks `is_superadmin`; a guard test fails when a file outside the
   existing allow-list (the files that read it on the day this spec is implemented) gains a read
   of `is_superadmin`.
7. **There is always an owner.** Revoking or downgrading the last active `owner` row answers 409
   `{"error": "LAST_OWNER"}`. A role can be granted only to an `@levapp.app` email (400
   `{"error": "NOT_STAFF_DOMAIN"}` otherwise). Grant, change and revoke each write an audit row
   with the role before and after.
8. **Every write is audited, in the same transaction.** Every `/admin/api/*` view whose methods
   include anything other than `GET`, `HEAD` or `OPTIONS` is wrapped by `@audited("<action>")`.
   The wrapper captures `before` and `after` as the service returns them, inserts the
   `admin_audit_log` row in the request's transaction, and the write and its audit row commit or
   roll back together. Side effects outside the database (email, push, CRM) run after the commit,
   as they do in the product. Sign-in (rules 1–2) and "view as" (`admin.approvals-and-users`
   rule 9) are `POST` routes and so are covered by the same wrapper.
9. **The audit log is append-only.** `GET /admin/api/audit` (`support`) lists rows newest first,
   filtered by `actorEmail`, `action`, `targetType`, `targetId` and a date range, 50 per page.
   There is no route that updates or deletes an audit row; the model refuses an update in
   `before_flush`.
10. **Request ids.** Every `/admin/api/*` response carries `X-Request-Id`. An incoming
    `X-Request-Id` of 8–64 characters from `[A-Za-z0-9-]` is kept; otherwise a new UUID4 is
    generated. The audit row stores the same value, so a log line, a response and an audit row
    can be matched.
11. **The blueprint answers only on the admin host.** `ADMIN_HOSTS` lists the hosts the admin
    blueprint serves (`admin.levapp.app` in prod, `admin.staging.levapp.app` in staging, the
    local dev host in development). A `/admin/api/*` request whose `Host` is not listed answers
    404, so the product hostnames never expose it even if a proxy rule is wrong.
12. **Deploy topology: same VM, same pipeline.** `deploy-prod.yaml` and `deploy-staging.yaml`
    each build one more image from `frontend/apps/admin` (static build served by nginx, like the
    web image), tagged with the commit SHA like the others, and run it as one more container
    published on the loopback interface only. The host nginx gains one server block per
    environment for the admin host: `/` goes to the admin container, `/admin/api/` goes to the
    existing backend container of the same environment. One DNS record per environment is added
    at the DNS provider, proxied like the product's. Staging's console signs in against
    staging's database and staging's `admin_roles`; the two environments share no role or audit
    data. No new VM, database or deploy workflow. Operational identifiers (machine names,
    addresses, ports, accounts) are kept out of this spec and out of tracked files (R-036).
13. **Configuration.** `ADMIN_GOOGLE_CLIENT_ID` (public; the browser needs it too) and
    `ADMIN_HOSTS` are set per environment in the tracked env templates. The Google OAuth client is
    of type "Internal" to the Workspace, with both admin origins authorised. No client secret is
    needed for the ID-token flow; none is stored. `assert_production_secrets` fails start-up in
    production when `ADMIN_GOOGLE_CLIENT_ID` or `ADMIN_HOSTS` is empty.
14. **No admin code in the product apps.** Admin API clients, screens and strings live only in
    `frontend/apps/admin`. Nothing under `frontend/apps/web`, `frontend/apps/mobile` or
    `frontend/packages/*` imports from `frontend/apps/admin`, references `/admin/api`, or holds an
    admin resource client. A guard test enforces it (criteria below). The only product-side code
    this epic adds is not admin code: the read-only "view as" handling and banner
    (`admin.approvals-and-users` rule 9), the delivery-incident records and the `healthz` fields
    (`admin.engine-health` rules 3 and 5), and the capability switch read
    (`admin.clubs-and-switches` rule 5); none offers a staff action. The existing product admin
    surface (Settings → Admin, `packages/api/src/resources/admin.ts`, `/api/app/admin/*`) is
    removed by `admin.approvals-and-users` and `admin.clubs-and-switches`, after which the guard's
    allow-list for it is empty.
15. **Web only, by design (R-024 exception).** The console is a staff tool used at a desk, has no
    coach or student user, and is not built for phones; it has no iOS or Android counterpart. This
    does not breach R-024, which is about `apps/web` features reaching `apps/mobile`: the parity
    move in this epic is that the product's Admin section leaves web and iOS in the same ticket
    (PAD-532). The console is responsive enough to read on a phone browser but makes no promise
    beyond that.
16. **Language.** The console's strings use the shared i18n setup with `pt` and `en`, defaulting to
    the browser language, falling back to `pt`.

### Acceptance Criteria

#### A company account with a role signs in (rules 1, 3)
- **Given** an active `operator` row for `ana@levapp.app` and a stubbed Google verifier returning `{email: "ana@levapp.app", email_verified: true, hd: "levapp.app"}`
- **When** the console posts that credential to `POST /admin/api/auth/google`
- **Then** the response is 200 with a token whose decoded claims have `aud = "levapp-admin"`, `role = "operator"`, an expiry 12 hours out, and an audit row `auth.sign_in` with `outcome = ok` exists

#### A personal Google account is refused (rule 1)
- **Given** the verifier returns `{email: "ana@gmail.com", email_verified: true}` (no `hd`)
- **When** it is posted to `auth/google`
- **Then** the response is 403 `NOT_STAFF_DOMAIN`, no token is issued, and an audit row `auth.sign_in` with `outcome = denied` names `ana@gmail.com`

#### A spoofed domain is refused (rule 1)
- **Given** the verifier returns `{email: "ana@levapp.app", email_verified: true, hd: "other.com"}`, and separately `{email: "ana@levapp.app.evil.com", hd: "levapp.app"}`
- **When** each is posted
- **Then** both are 403 `NOT_STAFF_DOMAIN`

#### A domain account without a role is refused (rule 2)
- **Given** no `admin_roles` row for `rui@levapp.app`
- **When** a valid `rui@levapp.app` credential is posted
- **Then** the response is 403 `NO_ADMIN_ROLE` and an audit row with `outcome = denied` exists

#### Tokens do not cross (rule 3)
- **Given** a valid admin token and a valid product token for a superadmin user
- **When** the admin token calls `GET /api/auth/me`, and the product token calls `GET /admin/api/audit`
- **Then** both are 401, and neither request changed any row

#### A revoked role ends access on the next request (rule 4)
- **Given** `ana@levapp.app` signed in as `operator`
- **When** the owner revokes her role and she then calls `GET /admin/api/audit`
- **Then** the response is 401 although her token has not expired

#### Support cannot write (rule 5)
- **Given** a `support` token
- **When** it posts to any non-`GET` route of the blueprint (each one, enumerated from the URL map)
- **Then** every response is 403 `ADMIN_ROLE_TOO_LOW` and every target row is unchanged

#### Only the owner manages roles (rules 5, 7)
- **Given** an `operator` token and an `owner` token
- **When** each posts `POST /admin/api/roles` `{email: "rui@levapp.app", role: "support"}`
- **Then** the operator gets 403 and the owner 201, and one audit row `role.grant` has `after = {email: "rui@levapp.app", role: "support"}`

#### The last owner cannot be removed (rule 7)
- **Given** exactly one active `owner` row
- **When** that owner revokes or downgrades their own role
- **Then** the response is 409 `LAST_OWNER` and the row is unchanged

#### Roles only for the company domain (rule 7)
- **Given** an `owner` token
- **When** it grants a role to `someone@gmail.com`
- **Then** the response is 400 `NOT_STAFF_DOMAIN`

#### The migration seeds the existing superadmin as owner (rule 6)
- **Given** a database with one user `is_superadmin = true` whose email is `Boss@LevApp.app`, and one ordinary user
- **When** the migration runs (SQLite and Postgres, R-030)
- **Then** `admin_roles` holds exactly two active `owner` rows, `admin@levapp.app` and `boss@levapp.app`, and `is_superadmin` is still present and unchanged on the user

#### No new reader of `is_superadmin` (rule 6)
- **Given** the guard's allow-list of files that read `is_superadmin`
- **When** a file outside that list reads `is_superadmin`
- **Then** the guard test fails and names the file

#### Every write route is audited (rule 8)
- **Given** the Flask URL map
- **When** the guard test walks every rule under `/admin/api/` whose methods include anything beyond `GET`, `HEAD`, `OPTIONS`
- **Then** each view function carries the `@audited` marker, and the test fails naming any route that does not, including one added later

#### The write and its audit row commit together (rule 8)
- **Given** an audited write route whose audit insert is made to raise
- **When** the route is called
- **Then** the response is 500, the target row is unchanged and no audit row exists; and with the insert restored, the target change and one audit row both exist with the same `request_id` as the response's `X-Request-Id`

#### The audit log cannot be changed (rule 9)
- **Given** an audit row
- **When** the guard test lists the blueprint's routes, and a test session updates the row's `after` and flushes
- **Then** no route under `/admin/api/audit` accepts `PUT`, `PATCH` or `DELETE`, and the flush raises

#### Request ids are echoed and stored (rule 10)
- **Given** a request with `X-Request-Id: abc-12345`, and another with `X-Request-Id: <script>`
- **When** each calls an audited route
- **Then** the first response and its audit row carry `abc-12345`; the second carry a fresh UUID4

#### The blueprint is invisible on the product host (rule 11)
- **Given** `ADMIN_HOSTS = ["admin.levapp.app"]`
- **When** `GET /admin/api/audit` is sent with `Host: levapp.app`, and again with `Host: admin.levapp.app` and an admin token
- **Then** the first is 404 and the second is 200

#### Production refuses to start without the admin configuration (rule 13)
- **Given** a production config with `ADMIN_GOOGLE_CLIENT_ID` empty
- **When** `assert_production_secrets` runs
- **Then** it raises naming `ADMIN_GOOGLE_CLIENT_ID`

#### The deploy builds and runs the admin image in both environments (rule 12)
- **Given** `deploy-prod.yaml` and `deploy-staging.yaml`
- **When** a workflow-shape test reads them
- **Then** each builds an image from `frontend/apps/admin` tagged with the commit SHA, runs it with a port published on `127.0.0.1` only, and the tracked nginx configuration has a server block for the matching admin host that proxies `/admin/api/` to that environment's backend

#### The product apps carry no admin code (rule 14)
- **Given** the source trees `frontend/apps/web`, `frontend/apps/mobile` and `frontend/packages`
- **When** the guard test scans them
- **Then** no file imports from `apps/admin`, no file contains the string `/admin/api`, and no file is an admin resource client; the test fails naming each offender

#### The console builds alone (rules 14, 16)
- **Given** the npm workspace
- **When** `apps/admin` is built
- **Then** its bundle contains the console and no product route, and `apps/web`'s bundle contains no console string (a known console-only i18n key is absent)

### Not this spec
- Coach approvals, the user directory, roles screens and "view as" — `admin.approvals-and-users`.
- Clubs, courts, coach↔club links and platform switches — `admin.clubs-and-switches`.
- The engine health page — `admin.engine-health`.
- Plans and entitlements — `admin.commercial-groundwork`.
- Signing coaches or students in with Google (draft decision
  `.cortex/atlas/decisions/2026-09-10-sign-in-with-google.md`), which this spec neither needs nor
  enables.
- Dropping `users.is_superadmin` (after every reader is gone, a later ticket).

### Notes
- Linear: PAD-531. Epic PAD-530.
- The guard tests named here (audit coverage, token separation, no admin code in product apps,
  no new `is_superadmin` reader) are the enforcement for the business rules "every change is
  recorded" and "the product apps carry no staff code"; they belong in the backend pytest lane,
  which already reads frontend files (as `test_pad327` does).
- PyJWT rejects a token that carries an `aud` when the verifier expects none, so the product side
  may need no change for rule 3; the criterion "Tokens do not cross" pins the behaviour either
  way.
- OPEN: the 12-hour admin session length and the absence of silent refresh are defaults chosen
  for this draft; the owner may prefer a shorter session.
- OPEN: whether the Google client allows only the Workspace ("Internal" consent screen) is a
  console setting outside the repo; rule 1's `hd` and email checks hold either way.
