---
about: "iOS universal links (PAD-184): the app claims `levapp.app` + `padellevelup.com` (`apps/mobile/app.json` → `ios.associatedDomains`). Both must serve…"
permanence: changing
verified: "2026-09-16 (told)"
origin:
  - migrated:compass/environment.md#8@ef7a5f3
---

- **iOS universal links** (PAD-184): the app claims `levapp.app` + `padellevelup.com` (`apps/mobile/app.json` → `ios.associatedDomains`). Both must serve `/.well-known/apple-app-site-association` as `application/json`, 200, **no redirect** — the container half is `apps/web/nginx.conf` (exact-match `location =`, `types { }` + `default_type`), the host-vhost half is manual and unversioned. Verify: `curl -sSI https://levapp.app/.well-known/apple-app-site-association` (a `text/html` body means the SPA fallback swallowed it). Runbook + device test steps: `docs/infra/universal-links.md` (local-only, `docs/` is gitignored) and the PAD-184 Linear thread.
