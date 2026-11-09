---
id: admin.foundation
status: draft
depends_on: [auth.login, auth.token-refresh]
serves: [P-ADMIN-2]
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
   verifies it with `google-auth` and accepts it only when all five hold, **in our code**, whatever
   the Google console's consent-screen setting says (External, Testing mode; see rule 13): (a) the signature verifies
   against Google's published keys and the token has not expired; (b) `aud` equals
   `ADMIN_GOOGLE_CLIENT_ID`; (c) `iss` is `accounts.google.com` or `https://accounts.google.com`;
   (d) `email_verified` is true; (e) the `hd` claim is `levapp.app` and the email ends with
   `@levapp.app`. A token failing (a), (b) or (c) is 401 `{"error": "GOOGLE_TOKEN_INVALID"}`; one
   failing (d) or (e) is 403 `{"error": "NOT_STAFF_DOMAIN"}`. There is no console password, no
   password reset and no sign-up. (Decision 2026-10-07, coordinator: the domain check lives in
   the backend too, because a consent-screen setting could be loosened by accident. Since
   2026-10-09 the client is External in Testing mode, so these checks are the domain wall.)
2. **A domain account still needs a role.** A verified `@levapp.app` email with no active
   `admin_roles` row answers 403 `{"error": "NO_ADMIN_ROLE"}`; no role is ever assumed by
   default. Both refusals write an audit row
   (`action = auth.sign_in`, `outcome = denied`, `actor_email` = the email Google asserted, or
   `unknown` when the token did not verify).
3. **The admin token is a separate audience.** On success the backend issues a JWT with
   `aud = "levapp-admin"`, `sub` = the `admin_roles.id`, a `role` claim, an `email` claim and an
   expiry of 12 hours. There is no silent refresh; after 12 hours the staff member signs in with
   Google again. Every `/admin/api/*` route except the two unauthenticated ones, `auth/google` and
   `GET auth/config` (rule 13), requires a token whose `aud` is `levapp-admin` and answers 401
   `{"error": "ADMIN_TOKEN_REQUIRED"}` for a missing token or any other token, a product token
   included. `POST auth/logout` is the third session route: every role may call it (it ends the
   caller's own session and writes nothing else). Every product route (`/api/*`, `/auth/*`, the SSE
   stream) answers 401 for a token that carries any `aud` claim. Product tokens keep their
   current shape (no `aud`), so no product session is affected.
4. **The role is read on every request.** The token's `role` claim is only a hint for the UI; the
   backend loads the `admin_roles` row by `sub` on each request and answers 401 when the row is
   missing or revoked, so revoking a role ends that person's access on their next request.
   `POST /admin/api/auth/logout` adds the token's `jti` to `token_blocklist`.
5. **Role matrix.** Each route declares the lowest role it needs; the order is
   `support < operator < owner`. A request below the route's role answers 403
   `{"error": "ADMIN_ROLE_TOO_LOW"}` and writes an audit row with `outcome = denied`.
   - `support`: every `GET` route. No write of any kind.
   - `operator`: everything `support` can do, plus every write except role management and the
     capability kill-switches.
   - `owner`: everything, plus `POST|DELETE /admin/api/roles/*` (grant, change, revoke a role) and
     `PUT /admin/api/settings/capabilities/*` (`admin.clubs-and-switches` rule 6).
   - A token issued before the role row's latest grant or change (`granted_at`) is refused, so
     re-granting a revoked email (which re-activates its row) never revives an older token
     (hardening 2026-10-07). The last-owner check of rule 7 locks the active owner rows.
   - One exception to the order: `POST /admin/api/users/<id>/view-as` needs the `operator` role
     exactly (`admin.approvals-and-users` rule 9).
6. **`admin_roles` replaces `is_superadmin` for new code.** The migration creates both tables and
   seeds one `owner` row for `admin@levapp.app` and one `owner` row for the email of every user
   with `is_superadmin = true` (deduplicated, lower-cased), with `granted_by_email` null, **only
   for emails in `@levapp.app`** (hardening 2026-10-07: any other email could never sign in,
   rule 1, so its row would only be something to clean up). No new code checks `is_superadmin`; a guard test fails when a file outside the
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
   There is no route that updates or deletes an audit row; the model refuses an update or a
   delete in `before_flush`, and a bulk update or delete of the table. The one exception is
   retention (`admin.data-retention` rule 5, owner decision 2026-10-21 on PAD-638): rows older than
   the period (5 years by default) are removed by the daily sweep, under its session flag.
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
12a. **Hardening (coordinator review, 2026-10-07).** `POST auth/google` is rate-limited per IP
    (`AUTH_RATE_LIMIT_ADMIN_SIGN_IN`, default 10 per 60 s; 429 `RATE_LIMITED`). Google's signing
    certificates are cached for the max-age Google sends. The console image sends a
    Content-Security-Policy that allows Google Identity Services (`accounts.google.com/gsi/`) for
    script, frame and connect and sets `frame-ancestors 'none'`, plus `Referrer-Policy:
    no-referrer`, `X-Content-Type-Options: nosniff` and HSTS, on every location. The fonts are
    self-hosted (`@fontsource`, PAD-635): `font-src 'self'`, and no page names or requests
    Google's font hosts (`e2e/self-hosted-fonts.spec.ts`).
13. **Configuration.** `ADMIN_GOOGLE_CLIENT_ID` (public; the browser needs it too) and
    `ADMIN_HOSTS` are set per environment in the tracked env templates; no new deploy secret
    exists for the console. The Google OAuth client is "LevApp Staff Console web" (Web
    application, in the VM's GCP project), one client for both environments. Its consent screen is **External in
    Testing mode**, with `admin@levapp.app` the only test user: Google refused "Internal" because
    the project is not in a Workspace organisation (owner decision, 2026-10-09). Only listed test
    users can complete Google's consent, and rule 1's `hd` and email checks hold whatever the
    setting. Both admin origins and `http://localhost:8090` are authorised as JavaScript origins (no redirect URI: the ID-token flow has
    none). No client secret is needed for the ID-token flow; none is stored.
    `assert_production_secrets` fails start-up in production when `ADMIN_HOSTS` is empty. An
    empty `ADMIN_GOOGLE_CLIENT_ID` does **not** stop start-up (it would crash-loop the next deploy
    before the owner has created the client): the backend logs a warning, `GET
    /admin/api/auth/config` (unauthenticated, host-checked) answers `{"googleClientId": "",
    "configured": false, "staffDomain": "levapp.app"}`, `POST auth/google` answers 503
    `{"error": "ADMIN_NOT_CONFIGURED"}`, and the console shows a "sign-in not configured" page.
    The console reads the client id from `auth/config` at run time, so the admin image needs no
    rebuild when the value arrives. (Decision 2026-10-07, coordinator.)
14. **No admin code in the product apps.** Admin API clients, screens and strings live only in
    `frontend/apps/admin`. Nothing under `frontend/apps/web`, `frontend/apps/mobile` or
    `frontend/packages/*` imports from `frontend/apps/admin`, references `/admin/api`, or holds an
    admin resource client. A guard test enforces it (criteria below). The only product-side code
    this epic adds is not admin code: the read-only "view as" handling and banner
    (`admin.approvals-and-users` rule 9), the delivery-incident records and the deploy identity
    (`admin.engine-health` rules 3 and 4), and the capability switch read
    (`admin.clubs-and-switches` rule 5); none offers a staff action. The existing product admin
    surface (Settings → Admin, `packages/api/src/resources/admin.ts`, `/api/app/admin/*`) is
    removed by `admin.approvals-and-users` and `admin.clubs-and-switches`, after which the guard's
    allow-list for it is empty.
15. **Web only, by design (R-024 exception).** The console is a staff tool used at a desk, has no
    coach or student user, and is not built for phones; it has no iOS or Android counterpart. This
    does not breach R-024, which is about `apps/web` features reaching `apps/mobile`: the parity
    move in this epic is that the product's Admin section leaves web and iOS in the same ticket
    (PAD-532). Staff also use the console from a phone browser: `admin.phone-console` (PAD-572)
    specifies that layout. There is still no iOS or Android console.
16. **Language.** The console's strings use the shared i18n setup with `pt` and `en`, defaulting to
    the browser language, falling back to `pt`.
17. **An unknown signing key refetches Google's certificates, at most once a minute** (#581 review,
    PAD-554). A token whose key id is not among the cached certificates of rule 12a triggers one
    refetch; further unknown key ids within the next 60 seconds are refused from the cache, so a
    burst of forged tokens cannot make the console hammer Google.

### Acceptance Criteria

#### ADMIN-FOUNDATION-1: A company account with a role signs in (rules 1, 3)
- **Given** an active `operator` row for `ana@levapp.app` and a stubbed Google verifier returning `{email: "ana@levapp.app", email_verified: true, hd: "levapp.app"}`
- **When** the console posts that credential to `POST /admin/api/auth/google`
- **Then** the response is 200 with a token whose decoded claims have `aud = "levapp-admin"`, `role = "operator"`, an expiry 12 hours out, and an audit row `auth.sign_in` with `outcome = ok` exists

#### ADMIN-FOUNDATION-2: A personal Google account is refused (rule 1)
- **Given** the verifier returns `{email: "ana@gmail.com", email_verified: true}` (no `hd`)
- **When** it is posted to `auth/google`
- **Then** the response is 403 `NOT_STAFF_DOMAIN`, no token is issued, and an audit row `auth.sign_in` with `outcome = denied` names `ana@gmail.com`

#### ADMIN-FOUNDATION-3: A spoofed domain is refused (rule 1)
- **Given** the verifier returns `{email: "ana@levapp.app", email_verified: true, hd: "other.com"}`, and separately `{email: "ana@levapp.app.evil.com", hd: "levapp.app"}`
- **When** each is posted
- **Then** both are 403 `NOT_STAFF_DOMAIN`

#### ADMIN-FOUNDATION-4: A token that does not verify is refused (rule 1 a–c)
- **Given** the verifier raises for a bad signature, and separately returns `{email: "ana@levapp.app", email_verified: true, hd: "levapp.app", aud: "other-client", iss: "accounts.google.com"}`, and separately the same claims with `iss: "https://evil.example"`
- **When** each is posted to `auth/google`
- **Then** all three are 401 `GOOGLE_TOKEN_INVALID`, no token is issued, and each writes an audit row `auth.sign_in` with `outcome = denied`

#### ADMIN-FOUNDATION-5: An unverified email is refused (rule 1 d)
- **Given** the verifier returns `{email: "ana@levapp.app", email_verified: false, hd: "levapp.app"}` for an active `operator`
- **When** it is posted
- **Then** the response is 403 `NOT_STAFF_DOMAIN` and no token is issued

#### ADMIN-FOUNDATION-6: Sign-in degrades when the client id is empty (rule 13)
- **Given** `ADMIN_GOOGLE_CLIENT_ID` empty and `ADMIN_HOSTS = ["localhost"]`
- **When** the console GETs `auth/config` and POSTs a credential to `auth/google`
- **Then** the first is 200 `{configured: false}`, the second is 503 `ADMIN_NOT_CONFIGURED`, and the verifier was never called

#### ADMIN-FOUNDATION-7: A domain account without a role is refused (rule 2)
- **Given** no `admin_roles` row for `rui@levapp.app`
- **When** a valid `rui@levapp.app` credential is posted
- **Then** the response is 403 `NO_ADMIN_ROLE` and an audit row with `outcome = denied` exists

#### ADMIN-FOUNDATION-8: Tokens do not cross (rule 3)
- **Given** a valid admin token and a valid product token for a superadmin user
- **When** the admin token calls `GET /api/auth/me`, and the product token calls `GET /admin/api/audit`
- **Then** both are 401, and neither request changed any row

#### ADMIN-FOUNDATION-9: A revoked role ends access on the next request (rule 4)
- **Given** `ana@levapp.app` signed in as `operator`
- **When** the owner revokes her role and she then calls `GET /admin/api/audit`
- **Then** the response is 401 although her token has not expired

#### ADMIN-FOUNDATION-10: Support cannot write (rule 5)
- **Given** a `support` token
- **When** it posts to any non-`GET` route of the blueprint (each one, enumerated from the URL map, except the session routes `auth/google` and `auth/logout`)
- **Then** every response is 403 `ADMIN_ROLE_TOO_LOW` and every target row is unchanged

#### ADMIN-FOUNDATION-11: Only the owner manages roles (rules 5, 7)
- **Given** an `operator` token and an `owner` token
- **When** each posts `POST /admin/api/roles` `{email: "rui@levapp.app", role: "support"}`
- **Then** the operator gets 403 and the owner 201, and one audit row `role.grant` has `after = {email: "rui@levapp.app", role: "support"}`

#### ADMIN-FOUNDATION-12: The last owner cannot be removed (rule 7)
- **Given** exactly one active `owner` row
- **When** that owner revokes or downgrades their own role
- **Then** the response is 409 `LAST_OWNER` and the row is unchanged

#### ADMIN-FOUNDATION-13: Roles only for the company domain (rule 7)
- **Given** an `owner` token
- **When** it grants a role to `someone@gmail.com`
- **Then** the response is 400 `NOT_STAFF_DOMAIN`

#### ADMIN-FOUNDATION-14: The migration seeds the existing superadmin as owner (rule 6)
- **Given** a database with one user `is_superadmin = true` whose email is `Boss@LevApp.app`, and one ordinary user
- **When** the migration runs (SQLite and Postgres, R-030)
- **Then** `admin_roles` holds exactly two active `owner` rows, `admin@levapp.app` and `boss@levapp.app`, and `is_superadmin` is still present and unchanged on the user

#### ADMIN-FOUNDATION-15: No new reader of `is_superadmin` (rule 6)
- **Given** the guard's allow-list of files that read `is_superadmin`
- **When** a file outside that list reads `is_superadmin`
- **Then** the guard test fails and names the file

#### ADMIN-FOUNDATION-16: Every write route is audited (rule 8)
- **Given** the Flask URL map
- **When** the guard test walks every rule under `/admin/api/` whose methods include anything beyond `GET`, `HEAD`, `OPTIONS`
- **Then** each view function carries the `@audited` marker, and the test fails naming any route that does not, including one added later

#### ADMIN-FOUNDATION-17: The write and its audit row commit together (rule 8)
- **Given** an audited write route whose audit insert is made to raise
- **When** the route is called
- **Then** the response is 500, the target row is unchanged and no audit row exists; and with the insert restored, the target change and one audit row both exist with the same `request_id` as the response's `X-Request-Id`

#### ADMIN-FOUNDATION-18: The audit log cannot be changed (rule 9)
- **Given** an audit row
- **When** the guard test lists the blueprint's routes, and a test session updates the row's `after` and flushes
- **Then** no route under `/admin/api/audit` accepts `PUT`, `PATCH` or `DELETE`, and the flush raises

#### ADMIN-FOUNDATION-19: Request ids are echoed and stored (rule 10)
- **Given** a request with `X-Request-Id: abc-12345`, and another with `X-Request-Id: <script>`
- **When** each calls an audited route
- **Then** the first response and its audit row carry `abc-12345`; the second carry a fresh UUID4

#### ADMIN-FOUNDATION-20: The blueprint is invisible on the product host (rule 11)
- **Given** `ADMIN_HOSTS = ["admin.levapp.app"]`
- **When** `GET /admin/api/audit` is sent with `Host: levapp.app`, and again with `Host: admin.levapp.app` and an admin token
- **Then** the first is 404 and the second is 200

#### ADMIN-FOUNDATION-21: Production refuses to start without the admin hosts (rule 13)
- **Given** a production config with `ADMIN_HOSTS` empty and the signing secrets set
- **When** `assert_production_secrets` runs
- **Then** it raises naming `ADMIN_HOSTS`; with `ADMIN_HOSTS` set and `ADMIN_GOOGLE_CLIENT_ID` empty it does not raise

#### ADMIN-FOUNDATION-22: The deploy builds and runs the admin image in both environments (rule 12)
- **Given** `deploy-prod.yaml` and `deploy-staging.yaml`
- **When** a workflow-shape test reads them
- **Then** each builds an image from `frontend/apps/admin` tagged with the commit SHA, runs it with a port published on `127.0.0.1` only, and the tracked nginx configuration has a server block for the matching admin host that proxies `/admin/api/` to that environment's backend

#### ADMIN-FOUNDATION-23: The product apps carry no admin code (rule 14)
- **Given** the source trees `frontend/apps/web`, `frontend/apps/mobile` and `frontend/packages`
- **When** the guard test scans them
- **Then** no file imports from `apps/admin`, no file contains the string `/admin/api`, and no file is an admin resource client; the test fails naming each offender

#### ADMIN-FOUNDATION-24: The console builds alone (rules 14, 16)
- **Given** the npm workspace
- **When** `apps/admin` is built
- **Then** its bundle contains the console and no product route, and `apps/web`'s bundle contains no console string (a known console-only i18n key is absent)

#### ADMIN-FOUNDATION-25: The audit log lists newest first, 50 a page, filtered by actor, action, target and date (rule 9)
- **Given** 55 audit rows
- **When** the owner GETs `/admin/api/audit`, then page 2
- **Then** the first page holds the 50 newest with `hasMore` true, the second the other 5 with `hasMore` false, and each row carries its time in UTC, actor, role, action, target, before, after, request id and outcome
- **And** `action`, `actorEmail`, `targetType` with `targetId`, `from` and `to` each narrow the list to the rows that match, and to none when nothing does
- **And** the console's request leaves out a filter that is empty
test: `backend/padel_app/tests/test_pad531_audit.py` › `test_the_audit_log_lists_newest_first_with_filters_and_pages` (+1 more)

#### ADMIN-FOUNDATION-26: A write that is refused leaves one audit row saying so (rule 8)
- **Given** the owner
- **When** they POST a role for `rui@gmail.com`, which is refused with 400
- **Then** exactly one `role.grant` audit row exists for the attempt, with the owner as actor and outcome `error`
test: `backend/padel_app/tests/test_pad531_audit.py` › `test_a_service_error_is_rolled_back_and_recorded`

#### ADMIN-FOUNDATION-27: Google sign-in is rate-limited per IP (rule 12a)
- **Given** the limit set to 3 attempts in 60 seconds
- **When** one client POSTs `/admin/api/auth/google` four times
- **Then** the first three are answered on their merits and the fourth is 429
- **And** the limit the code ships with is 10 attempts in 60 seconds
test: `backend/padel_app/tests/test_pad531_hardening.py` › `test_google_sign_in_is_rate_limited_per_ip` (+1 more)

#### ADMIN-FOUNDATION-28: Google's certificates are cached, and an unknown key id refetches them at most once a minute (rules 12a, 17)
- **Given** Google's certificates answered with a max-age of an hour
- **When** they are needed again within the hour, then after it
- **Then** they are fetched once, then once more
- **Given** a token signed with a key id the cache does not hold
- **When** it is verified
- **Then** the certificates are fetched again once, and the token verifies when the new set holds its key
- **And** a burst of tokens with unknown key ids is refused with a single refetch, and the next refetch comes only a minute later
test: `backend/padel_app/tests/test_pad531_hardening.py` › `test_google_certificates_are_fetched_once_while_fresh` (+3 more)

#### ADMIN-FOUNDATION-29: A token stops working when its role is granted again or changed, and at logout (rules 4, 5)
- **Given** an operator holding a valid token
- **When** the owner revokes the role and grants that email a role again, or changes the role
- **Then** the old token answers 401 and a token issued afterwards answers 200
- **And** after `POST /admin/api/auth/logout` the same token answers 401
test: `backend/padel_app/tests/test_pad531_hardening.py` › `test_a_token_issued_before_a_regrant_is_refused` (+2 more)

#### ADMIN-FOUNDATION-30: A request with no valid admin token is refused (rule 3)
- **Given** no `Authorization` header, or a bearer that is not a token
- **When** any `/admin/api/*` route that needs a role is called
- **Then** the answer is 401, with `{"error": "ADMIN_TOKEN_REQUIRED"}` when the header is missing, and nothing is readable
test: `backend/padel_app/tests/test_pad531_plumbing.py` › `test_no_token_is_401` (+1 more)

#### ADMIN-FOUNDATION-31: Granting, changing and revoking a role (rule 7)
- **Given** the owner, and a revoked `operator` row for `rui@levapp.app`
- **When** they grant `Rui@LevApp.app` the `support` role
- **Then** the old row is active again as `support`, granted by the owner, and no second row exists
- **And** a grant links the product account that has the same email, whatever its case
- **And** an unknown role is refused as `INVALID_ROLE`, and a second active row for an email as 409
- **And** a change and a revoke each write an audit row with the email and role before and after; a revoked row stays in the list as inactive; revoking it again answers 404
test: `backend/padel_app/tests/test_pad531_roles.py` › `test_an_unknown_role_and_a_duplicate_are_refused` (+3 more)

#### ADMIN-FOUNDATION-32: The sign-in page offers Google, posts the credential to the console alone and says why a person is refused (rules 1, 2, 3, 13)
- **Given** a configured console and no stored session
- **When** the console opens
- **Then** `GET /admin/api/auth/config` answers the client id, `configured` true and the staff domain, and the page shows the Google button
- **When** Google hands back a credential
- **Then** it is posted to `/admin/api/auth/google` with nothing else in the body, and on success the session is stored for this tab
- **And** `NOT_STAFF_DOMAIN` shows that only the company domain signs in, and `NO_ADMIN_ROLE` tells the person to ask an owner
test: `backend/padel_app/tests/test_pad531_sign_in.py` › `test_auth_config_exposes_the_public_client_id` (+4 more)

#### ADMIN-FOUNDATION-33: The console keeps its session in the tab and drops it on a 401 (rules 3, 4)
- **Given** a stored, unexpired session
- **When** the console opens and calls the API
- **Then** the shell shows the session's email and role (support also reads as read-only), and each request carries the token as a bearer header and sets no cookie; the two unauthenticated routes carry no token
- **When** any call answers 401
- **Then** the stored session is removed and the sign-in page shows
- **And** a refused sign-in keeps its error code and ends no session; a network failure is reported as `NETWORK`; a stored session past its expiry is not read back and is never renewed
test: `frontend/apps/admin/src/App.test.tsx` › `opens the shell with the stored session's email and role, and support reads as read-only` (+7 more)

#### ADMIN-FOUNDATION-34: The console speaks pt and en, by the browser's language (rule 16)
- **Given** the console's two locale files
- **Then** they hold the same keys, all under the `admin` namespace
- **And** a browser in English gets `en`; any other language, or none, gets `pt`
test: `frontend/apps/admin/src/i18n.test.ts` › `pt and en carry the same keys` (+2 more)

#### ADMIN-FOUNDATION-35: The console's nginx sends the security headers on every location and refuses a token in the URL (rule 12a)
- **Given** the tracked nginx configuration of the admin host, in both environments and in the image
- **When** it is read
- **Then** every location includes the security-headers snippet: a Content-Security-Policy that allows only the console itself and Google's sign-in script and frame, `frame-ancestors 'none'`, no referrer, no sniffing, and HSTS
- **And** a request carrying `token`, `t` or `access_token` in its query string is answered 404 before any location is matched
test: `backend/padel_app/tests/test_pad531_hardening.py` › `test_the_console_sends_its_security_headers_on_every_location` (+1 more)

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
- Probe 2026-10-07 (Session E): Flask-JWT-Extended 4.6 does NOT verify `aud` when no audience is
  configured, so a token carrying `aud = "levapp-admin"` signed with `JWT_SECRET_KEY` was accepted
  by `GET /api/auth/me` as the user whose id equals `sub`. The product side therefore needs an
  explicit refusal of any token with an `aud` claim (the JWT blocklist loader); "Tokens do not
  cross" pins it.
- Decision 2026-10-07 (owner): the admin session is 12 hours with no silent refresh.
- `admin_roles.email` is unique, so granting a role to an email whose row is revoked re-activates
  that row (new `role`, `granted_by_email`, `granted_at`, `revoked_at` null) rather than inserting.
- Audit `outcome`: 2xx → `ok`; 401 and 403 → `denied`; any other status or an exception → `error`.
  A request refused for lack of a token (401 `ADMIN_TOKEN_REQUIRED`) is not audited: there is no
  actor to name.
- Numbering of the new criteria is unconfirmed (Session E, 2026-10-07).
- Resolved 2026-10-09: the consent screen could not be "Internal" (the project is not in a
  Workspace organisation); it is External in Testing mode with one test user. Each new staff
  member must be added as a test user before they can sign in, until the app is published.

### Open questions

- **Rule 5 and ADMIN-FOUNDATION-10 say support writes nothing; finance lets support write.**
  - Spec: rule 5, "`support`: every `GET` route. No write of any kind." ADMIN-FOUNDATION-10: a
    support token on any non-`GET` route gets 403, the session routes excepted.
  - Other spec: `admin.finance` rule 1 (owner's answer Q4, 2026-10-23) gives every finance route,
    writes included, to `FINANCE_ROLE = "support"`.
  - Code today: finance is the code's one exception. `test_pad531_plumbing.py` leaves the five
    finance write routes out of the "support cannot write" walk (`SUPPORT_WRITES`), and
    ADMIN-FINANCE-1 proves support creates a cost.
  - Recommendation: keep the owner's finance answer and amend this rule and criterion to name the
    exception.
  - Proposed text for rule 5: "`support`: every `GET` route, and no write except finance
    (`admin.finance` rule 1)." For ADMIN-FOUNDATION-10's When: "…except the session routes
    `auth/google` and `auth/logout` and the finance routes of `admin.finance` rule 1".
- **ADMIN-FOUNDATION-24 speaks of the built bundles; its tests read source files.**
  - Spec: "its bundle contains the console and no product route, and `apps/web`'s bundle contains
    no console string".
  - Tests: `console-only.test.ts` scans the console's sources for product routes and clients, and
    the product source trees for one console-only string. Nothing builds or reads a bundle.
  - Recommendation: reword the criterion to the sources, which is what is checked on every run; a
    bundle check would need a build in the test lane.
  - Proposed Then: "the console's sources name no product route and no product API client, and no
    product source file holds a console-only string (a known console-only i18n key is absent)".
- **The header still says "Draft: no code exists" and `status: draft`.** The console is built (PAD-531
  and its followers) and its criteria have tests. Recommendation: set the status to
  `implemented` and drop that sentence. `admin.moderation` carries `status: draft` in the same way.
