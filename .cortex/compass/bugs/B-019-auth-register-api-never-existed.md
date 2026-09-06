---
id: B-019
title: "auth.register reads `implemented` but `POST /api/auth/register` was never built — only a legacy server-rendered template exists"
type: layer-drift
severity: medium
status: open
affects:
  - .specflow/specs/auth/register.spec.md
  - backend/padel_app/modules/api_auth.py
  - backend/padel_app/modules/auth.py
related_specs:
  - auth.register
  - auth.newcomer-creates-and-activates-an-account
proposed_fix: "Rewrite auth.register as the self-service signup (decision 2026-09-06) and build it; status draft until then."
opened: 2026-09-06T18:00:00Z
---

# B-019 — `auth.register` describes a route that does not exist

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

**Resolution path:** the 2026-09-06 decision rewrites `auth.register` as the self-service signup
for both roles; `status: draft` until it ships. Close this bug when the new criteria pass.

*Found while specifying registration and connections, 2026-09-06.*
