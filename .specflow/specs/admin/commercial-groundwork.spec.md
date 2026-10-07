---
id: admin.commercial-groundwork
status: draft
depends_on: [admin.foundation, admin.clubs-and-switches]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-005, R-022, R-023, R-024]
---

# admin.commercial-groundwork

> Linear: PAD-535 (this spec), epic PAD-530. **Blocked** by PAD-536 (the CFO questionnaire) and
> PAD-472; do not plan or build until both are answered and this spec is revised. Builds on
> PAD-531 (`admin.foundation`) and PAD-533 (`admin.clubs-and-switches`). Owner decisions
> 2026-10-06. Draft: no code exists.

### Intent
Record which plan each coach is on and what that plan includes, before any payment exists, so
pricing can be introduced later without a second data model. Staff assign plans by hand (manual,
trial, complimentary); a later payment provider becomes one more source. What a plan includes is
exposed to the apps through the existing capabilities mechanism, so a client hides what the coach
is not entitled to the same way it hides what the server withholds today.

### Entities
- **CREATES:** `plans` — `id`, `key` (unique slug, e.g. `starter`), `name`, `entitlements` (JSON
  list of entitlement keys), `active` (bool), `created_at`, `updated_at`. No price column until
  PAD-536 says what a price is.
- **CREATES:** `coach_plans` — `id`, `coach_id` (FK → coaches, CASCADE), `plan_id` (FK → plans,
  RESTRICT), `source` (`manual`|`trial`|`comp`|`stripe`), `starts_at`, `ends_at` (nullable),
  `note` (nullable), `created_by_email`, `created_at`, `updated_at`. At most one row per coach is
  current (`starts_at <= now < ends_at` or `ends_at` null); a partial unique index or a service
  check enforces it.
- **READS:** Coach, `admin_roles`, the capability registry (`utils/client_capabilities.py`)

### Rules
1. **Plans are data.** `GET /admin/api/plans` (`support`), `POST /admin/api/plans` and
   `PATCH /admin/api/plans/<id>` (`owner`) list, create and edit plans; a plan is never deleted,
   only made inactive. An entitlement key that is not in the registry (rule 5) is 400.
2. **Assigning a plan.** `POST /admin/api/coaches/<coach_id>/plan` `{planId, source, startsAt?,
   endsAt?, note?}` (`operator`) ends the coach's current row at `startsAt` (default now) and
   starts the new one. `source` is one of `manual`, `trial`, `comp`; `stripe` is refused (400
   `SOURCE_RESERVED`) until a payment provider is specified. A `trial` requires `endsAt`. Audited
   as `coach.plan_assign` with the previous and new plan.
3. **No plan means today's product.** A coach with no current row is entitled to everything the
   product offers today. No existing coach loses anything when this ships; the migration creates
   the tables and no rows.
4. **Expiry.** A row past its `endsAt` stops being current; with no later row the coach falls back
   to rule 3. Nothing is deleted.
5. **Entitlements ride on capabilities.** Each entitlement key is a capability name registered in
   `utils/client_capabilities.py`. The server answers a coach's entitlements in `GET
   /api/auth/me` as `entitlements: [...]` (camelCase, R-022) only for a client that declares the
   `entitlements` capability in `X-LevApp-Capabilities`; and a server-side check
   `coach_entitled(coach, key)` fails closed exactly as `client_declares()` does. A capability
   switched off by `admin.clubs-and-switches` rule 5 is off whatever the plan says.
6. **Both apps.** Any client screen that changes with entitlements ships on web and iOS together
   (R-024). The console's plan screens are web-only (`admin.foundation` rule 15).

### Acceptance Criteria

#### A coach with no plan keeps everything (rule 3)
- **Given** coach `maria` with no `coach_plans` row and a client declaring `entitlements`
- **When** she GETs `/api/auth/me`
- **Then** `entitlements` lists every registered entitlement, and every feature behaves as before this spec

#### An operator gives a complimentary plan (rule 2)
- **Given** an active plan `starter` and an operator token
- **When** the operator assigns `starter` to `maria` with `source = comp`
- **Then** one current `coach_plans` row exists with `created_by_email` set, and one audit row `coach.plan_assign` exists

#### Stripe is reserved (rule 2)
- **Given** an operator token
- **When** it assigns a plan with `source = stripe`
- **Then** the response is 400 `SOURCE_RESERVED`

#### A trial ends on its own (rules 2, 4)
- **Given** a `trial` row for `maria` ending yesterday (pinned clock) and no later row
- **When** her entitlements are read
- **Then** she falls back to rule 3, and the trial row still exists

#### A kill-switch beats a plan (rule 5)
- **Given** `maria` on a plan including `evaluations`, and `evaluations` switched off by staff
- **When** the server checks `coach_entitled(maria, "evaluations")` for a client that declares it
- **Then** the feature is withheld

#### Only the owner edits plans (rule 1)
- **Given** an operator token
- **When** it POSTs `/admin/api/plans`
- **Then** the response is 403

### Not this spec
- Prices, currencies, taxes, invoices, payment providers, checkout, dunning — waiting on PAD-536.
- Club-level or player-level plans (only coaches have plans in this draft).
- Showing a coach their plan or an upgrade prompt in the apps — a later spec once pricing exists.

### Notes
- Linear: PAD-535, blocked by PAD-536 (CFO questionnaire) and PAD-472. Epic PAD-530.
- OPEN (PAD-536): which plans exist, what each includes, whether trials are automatic at signup,
  whether a plan belongs to a coach or to a club, and what happens to an over-limit coach when a
  plan ends. Rules 1–5 are the minimum that holds for any answer; expect this spec to be rewritten
  when the questionnaire returns.
- PAD-472 (payments and invoicing architecture, a decision ticket) already fixed one thing:
  payments do not live in the CRM, which only mirrors the paying state. It leaves open the
  processor (likely Stripe, in the backend), certified invoicing, App Store subscription rules
  (web versus in-app payment) and per-coach versus per-club billing; each can change rules 2–5.
