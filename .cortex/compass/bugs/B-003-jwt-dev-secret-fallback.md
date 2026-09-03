---
id: B-003
title: "JWT and session secrets fall back to hardcoded dev values"
type: layer-drift
severity: critical
status: resolved
affects:
  - auth.token-refresh
  - backend/padel_app/config.py
proposed_fix: "Fail startup in production when either secret is unset; align the env-var names in `deploy-prod.yaml`; rotate deliberately."
opened: 2026-04-14T00:00:00Z
resolved: 2026-09-03T16:30:00Z
---

# B-003 — JWT and session secrets fall back to hardcoded dev values

`config.py` reads `SECRET_KEY` (fallback `dev-secret-key`) and `JWT_SECRET_KEY` (fallback `dev-jwt-secret`). The deploy workflow injects `FLASK_SECRET_KEY`, not `SECRET_KEY`, and injects no `JWT_SECRET_KEY` at all — so production may be signing sessions and tokens with the dev fallbacks. Verify with `docker exec padelapp env`; fixing it rotates every live login.

*Triaged 2026-09-03 from the legacy `specflow/bugs.md` (April 2026 onboarding). Status `open` means not re-verified against current code.*

**Resolved 2026-09-03:** `get_config_class("production")` now refuses to start unless real `SECRET_KEY`/`FLASK_SECRET_KEY` and `JWT_SECRET_KEY` values are set; the deploy injects `JWT_SECRET_KEY` (prod) and separate `STAGING_*` secrets (staging), so a staging token is never valid on prod. All live sessions were invalidated once by the rotation.
