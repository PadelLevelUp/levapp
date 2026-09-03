---
id: B-003
title: "JWT and session secrets fall back to hardcoded dev values"
type: layer-drift
severity: critical
status: open
affects:
  - auth.token-refresh
  - backend/padel_app/config.py
proposed_fix: "Fail startup in production when either secret is unset; align the env-var names in `deploy-prod.yaml`; rotate deliberately."
opened: 2026-04-14T00:00:00Z
---

# B-003 — JWT and session secrets fall back to hardcoded dev values

`config.py` reads `SECRET_KEY` (fallback `dev-secret-key`) and `JWT_SECRET_KEY` (fallback `dev-jwt-secret`). The deploy workflow injects `FLASK_SECRET_KEY`, not `SECRET_KEY`, and injects no `JWT_SECRET_KEY` at all — so production may be signing sessions and tokens with the dev fallbacks. Verify with `docker exec padelapp env`; fixing it rotates every live login.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*
