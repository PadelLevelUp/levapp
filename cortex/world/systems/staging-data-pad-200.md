---
about: "Staging data (PAD-200): every staging deploy refreshes `padel_app_staging` from production via `backend/scripts/sync-staging-db.sh` on the VM, best-effort — a…"
permanence: changing
verified: "2026-11-12 (observed)"
origin:
  - migrated:compass/environment.md#6@ef7a5f3
  - session:7582a0e8-1bbb-443c-9913-5f43cb9b9526
---

- **Staging data (PAD-200)**: every staging deploy refreshes `padel_app_staging` from production via `backend/scripts/sync-staging-db.sh` on the VM, best-effort — a failed copy never fails the deploy — and then scrubs every outbound channel (push subscriptions, device tokens, e-mail addresses), so staging can never push or mail a real person even if it later gains the credentials. Anything created on staging is lost at the next deploy. What the copy implies for accounts on staging is below.
- **Logging in on staging (PAD-606).** After every sync the scrub (`backend/scripts/staging-scrub.sql`)
  renames every account: usernames become `user<id>` and emails `user<id>@staging.invalid`. Two fixed
  testers exist, `staging-coach` and `staging-student`. Every account gets one shared password, set from
  the GitHub Actions secret `STAGING_TEST_PASSWORD` (`sync-staging-db.sh` hashes it; with no secret, no
  account has a usable password). The value is also kept on the owner's Mac in `.claude/secrets.env`
  under the same key (set 2026-11-12), never in this repository. Production logins do not work on
  staging.
