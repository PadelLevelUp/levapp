---
about: "Staging data (PAD-200): every staging deploy refreshes `padel_app_staging` from production via `backend/scripts/sync-staging-db.sh` on the VM, best-effort — a…"
permanence: changing
verified: "2026-09-16 (told)"
origin:
  - migrated:compass/environment.md#6@ef7a5f3
---

- **Staging data (PAD-200)**: every staging deploy refreshes `padel_app_staging` from production via `backend/scripts/sync-staging-db.sh` on the VM, best-effort — a failed copy never fails the deploy — and then scrubs every outbound channel (push subscriptions, device tokens, e-mail addresses), so staging can never push or mail a real person even if it later gains the credentials. Anything created on staging is lost at the next deploy. What the copy implies for accounts on staging is in the local map.
