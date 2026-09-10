---
id: B-043
title: "Transactional mail images point at prod in every environment, and a missing /brand/* asset answers 200 text/html"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - auth.email-verification
  - auth.coach-approval
  - auth.mobile-universal-links
  - backend/padel_app/tools/email_templates.py
  - backend/.env.staging
  - backend/.env.prod
  - frontend/apps/web/nginx.conf
proposed_fix: "Every deployed environment sets PUBLIC_WEB_ORIGIN to its own origin (staging → https://staging.levapp.app, prod → https://levapp.app); nginx serves /brand/ with try_files $uri =404 so a missing asset is a 404, not the SPA shell."
opened: 2026-09-09T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-043 — Transactional mail images point at prod in every environment, and a missing /brand/* asset answers 200 text/html

**Source:** Linear PAD-251 §1 (Gmail iOS screenshot, staging build 14, 2026-09-09): the
verification mail's header rendered as a broken image with the blue `alt` text.

**What happens:** `email_templates.web_origin()` falls back to `https://levapp.app` because no
environment sets `PUBLIC_WEB_ORIGIN`, so staging mail loads its lockup from prod. When the
asset was not yet promoted to prod, the request did not 404: nginx's SPA `try_files … /index.html`
answered **200 `text/html`**, which a status-only check calls healthy.

**What should happen:** each environment's mail references that environment's own web origin,
so staging can test its own images; and a missing brand asset is an honest 404.

**Root cause:** Type 2 — incomplete rule. Rule 7 (the email) and `auth.coach-approval` rule 5
name the module that renders the mail and mention `PUBLIC_WEB_ORIGIN` as an override, but no
rule says every deployed environment must set it, so neither env file does. And
`auth.mobile-universal-links` documents the SPA fallback trap for one exact path only; nothing
keeps `/brand/*` off the fallback.

**Evidence (Phase 1):**
1. `grep PUBLIC_WEB_ORIGIN backend/.env.staging backend/.env.prod` → nothing; `config.py:174`
   reads it, `email_templates.py:27-28` honours it.
2. `curl -sI https://levapp.app/brand/does-not-exist.png` → `200 text/html` (2026-09-09).
   The lockup itself now answers `200 image/png` on both hosts because staging was promoted
   after the ticket was written; the fallback defect is unchanged.
3. `frontend/apps/web/nginx.conf`: only `location = /.well-known/apple-app-site-association`
   escapes `location / { try_files $uri $uri/ /index.html; }`.

**Affected specs:**
- Dev: `.specflow/specs/auth/email-verification.spec.md` rule 7;
  `.specflow/specs/auth/mobile-universal-links.spec.md` (nginx notes).
- Business: none — no outcome changes.

### Change Plan

**Spec to modify:** `.specflow/specs/auth/email-verification.spec.md`,
`.specflow/specs/auth/mobile-universal-links.spec.md`
**Change type:** add rule text + criteria

1. Rule 7 gains: every image and link in transactional mail is absolute and rooted at
   `PUBLIC_WEB_ORIGIN`; every deployed environment sets it to its own origin in
   `backend/.env.<env>`; the `https://levapp.app` default exists only for a box that sets nothing.
2. Universal-links nginx note gains: `/brand/` is served with `try_files $uri =404` so a missing
   asset never becomes the HTML shell; an availability check asserts `image/*`, not a 2xx.
3. Tests: pytest reading the two env files (config-as-code) and the verification mail rendered
   with a staging origin; vitest reading `nginx.conf` for the `/brand/` block.
4. Code: two env-file lines, one nginx location.

### Resolution

Implemented on `feature/pad-250-verification-flow` (2026-09-09).
- Spec changes: `auth/email-verification.spec.md` rule 7 + "The mail points at the environment
  that sent it"; `auth/mobile-universal-links.spec.md` notes.
- Tests: `backend/padel_app/tests/test_mail_origin_per_environment.py` (env files failed before
  the fix; renderer pins), `apps/web/src/test/nginx-brand-assets.test.ts` (failed before).
- Code: `PUBLIC_WEB_ORIGIN` in `backend/.env.staging` and `backend/.env.prod`;
  `location /brand/ { try_files $uri =404; }` in `apps/web/nginx.conf`.
- Resolved: 2026-09-09
