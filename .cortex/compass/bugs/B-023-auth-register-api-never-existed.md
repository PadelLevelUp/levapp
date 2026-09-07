---
id: B-023
title: "auth.register reads `implemented` but `POST /api/auth/register` was never built — only a legacy server-rendered template exists"
type: layer-drift
severity: medium
status: resolved
affects:
  - .specflow/specs/auth/register.spec.md
  - backend/padel_app/modules/api_auth.py
  - backend/padel_app/modules/auth.py
related_specs:
  - auth.register
  - auth.newcomer-creates-and-activates-an-account
proposed_fix: "Rewrite auth.register as the self-service signup (decision 2026-09-06) and build it; status draft until then."
opened: 2026-09-06T18:00:00Z
resolved: 2026-09-06T19:00:00Z
---

# B-023 — `auth.register` describes a route that does not exist

`.specflow/specs/auth/register.spec.md` carried `status: implemented` and an acceptance criterion
against `POST /api/auth/register`. `padel_app/modules/api_auth.py` (the `/api/auth` blueprint)
exposes `login`, `logout`, `me`, `delete_me`, `update_me` — no `register`. The only `/register`
in the backend is `padel_app/modules/auth.py:18`, a Flask-Login, server-rendered HTML form from
the pre-API app, not reachable from either client. `packages/api/src/resources/register.ts` is
the *activation* pair (`GET /app/register/user/<id>`, `POST /app/activate/user/<id>`), which
is `auth.activate`, not `auth.register`.

Consequence: the business spec `auth.newcomer-creates-and-activates-an-account` describes
"direct signup" as a journey that exists. It does not — every account today is created by a
coach, a club invitation, or by hand. PAD-138 was filed from Discord for exactly this gap.

**Resolved 2026-09-06 (PAD-210):** `auth.register` rewritten as the self-service signup for both
roles and built — `POST /api/auth/register` in `padel_app/modules/api_auth.py`, pinned by
`padel_app/tests/test_registration.py`.

*Found while specifying registration and connections, 2026-09-06.*
