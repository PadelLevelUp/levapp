---
about: One Google Workspace seat, admin@levapp.app, as the company identity
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:atlas/decisions/2026-09-03-google-workspace-single-seat.md@ef7a5f3
  - source:history/sources/2026-09-03-monorepo-cortex-workspace-handoff.md
  - session:session_0198iAmzyjfYiqu3DJSzaLLC
aliases:
  - decision.2026-09-03-google-workspace-single-seat
  - 2026-09-03-google-workspace-single-seat
---

## Answer

# One Google Workspace seat, admin@levapp.app, as the company identity

On 2026-09-03 the owner bought Google Workspace Business Starter for `levapp.app` — one seat, not one per founder — after learning the price is €8.10 per user per *month*, not per year. The existing `the old Gmail console account` account was upgraded in place (not a new tenant), so it became `admin@levapp.app` while keeping ownership of Google Cloud, Cloudflare and the Chrome profile used for automation; the old Gmail address remains an alias. `noreply@` and `hello@` are free aliases on that seat; founder mailboxes are deferred ("if the other founders want"). Other services (GitHub org billing, Docker Hub, Cloudflare profile, Expo, Linear, Anthropic, OpenRouter) are to be re-pointed to `admin@levapp.app` by changing their email, never by creating new accounts — Docker Hub's `padelapp` namespace in particular is baked into every image name and workflow. The Apple Developer team stays an Individual account until a legal entity exists. DMARC starts at `p=none` and tightens after DKIM has run for a week.

## Why

The reasons are part of the answer above: a 3.x narrative decision, migrated verbatim.

## Rejected

none recorded
