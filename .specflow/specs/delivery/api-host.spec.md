---
id: delivery.api-host
status: implementing
depends_on: [delivery.zero-downtime-deploy]
implements: ../../specs-business/delivery/the-api-has-its-own-address.business.md
governed_by: [R-024, R-036]
---

# delivery.api-host

> Linear: PAD-614, from the PAD-613 owner decision (2026-10-10): yes to an `api.levapp.app`
> subdomain. Drafted 2026-10-11 by Session E. The in-repo half; the DNS records and certificates
> are owner steps on the ticket.

### Intent
The API answers on `api.levapp.app` (prod) and `api.staging.levapp.app` (staging) with the same
paths as on the web hosts, so a client's base URL is `https://api.<env-host>/api`. The web build
reads its API base from a repository variable and defaults to the same-origin `/api`; the backend
allows exactly the listed web origins cross-origin. `levapp.app/api` keeps answering.

### Surfaces
- `infra/nginx/sites-available/levapp-api{,-http}`, `levapp-api-staging{,-http}` (hand-applied,
  `infra/nginx/README.md`).
- `backend/padel_app/__init__.py` (CORS), `backend/padel_app/config.py`
  (`cors_allowed_origins`), `backend/.env.prod`, `backend/.env.staging`.
- `frontend/apps/web/src/api/base.ts`, `api/client.ts`, `utils/pushNotifications.ts`,
  `frontend/Dockerfile`, the web build steps of `deploy-prod.yaml` / `deploy-staging.yaml`.
- Mobile: none (see Notes). Admin console: none (see Notes).

### Rules
1. **The API host serves only the API.** `api.levapp.app` proxies `/api/app/events` (SSE settings),
   `/api/app/register/` and `/api/` to the `levapp_api` upstream (PAD-588's two ports); staging the
   same to `levapp_api_staging`, except `/api/app/events`, which goes to the events process's
   `levapp_events_staging` (PAD-697, delivery.events-role; prod follows after PAD-704). Every other
   path answers 404.
2. **Same log protections.** The redacted access log (B-182), `error_log … crit` on the SSE and
   activation locations (B-182, B-183), `X-Real-IP` on every proxied location (PAD-554). A
   port-80 `-http` file answers the http-01 challenge and redirects the rest (B-383 shape).
3. **CORS: listed origins only.** `/api/*` grants CORS to the defaults (local dev, the VM's legacy
   address) plus `CORS_ALLOWED_ORIGINS` (prod: `https://levapp.app`, `https://www.levapp.app`;
   staging: `https://staging.levapp.app`). No wildcard, no credentials (Bearer tokens), the
   `Authorization` and `X-LevApp-Capabilities` headers allowed, `X-New-Token` exposed, preflight
   cached 600 s.
4. **One configurable web base.** Every web API call (the shared client, the SSE URL it builds,
   the push-subscription calls) goes through `API_BASE_URL`, from `VITE_API_BASE_URL` at build
   time (repository variables `API_BASE_URL` / `API_BASE_URL_STAGING`). Unset means `/api`, so a
   build is unchanged until the owner sets the variable.
5. **The old path stays.** `levapp.app/api` and `staging.levapp.app/api` keep their vhost
   locations; retiring them is a later ticket after the App Store client audit.

### Acceptance Criteria

#### The API host proxies only the API, with the log protections (rules 1, 2)
- **Given** the tracked vhosts
- **When** the shape test reads them
- **Then** each api host has exactly the SSE, activation and `/api/` locations to its upstream
  (plus a 404 root), the redacted log, `crit` error logs on the two token locations, `X-Real-IP`,
  http2 on 443, and a port-80 file answering the ACME challenge without `default_server`

#### Only listed web origins get CORS (rule 3)
- **Given** `CORS_ALLOWED_ORIGINS=https://levapp.app`
- **When** a preflight to `/api/app/healthz` comes from `https://levapp.app` with
  `Authorization, X-LevApp-Capabilities`
- **Then** it is allowed (those headers, max-age 600, no credentials); **and from**
  `https://evil.example` **then** no CORS header is granted

#### The web build's base is configurable and defaults to /api (rule 4)
- **Given** `VITE_API_BASE_URL` unset or blank **Then** the base is `/api`; **given**
  `https://api.levapp.app/api/` **then** `https://api.levapp.app/api`; and no web module calls
  `fetch` with a literal `/api/` URL

### Notes
- **iOS (R-024):** the app already reads its API from `EXPO_PUBLIC_API_URL`
  (`apps/mobile/src/lib/config.ts`, fallback `PRODUCTION_API_URL`). Pointing a build at the new
  host is a build-profile setting once DNS and the certificate exist; no app code changes here, so
  nothing ships web-only.
- **Admin console:** stays on its own host (`admin.levapp.app` → `/admin/api`); the admin
  blueprint checks the request's Host, so it does not move to the api host.
- The switch order and the owner's DNS/certificate steps are on PAD-614.
