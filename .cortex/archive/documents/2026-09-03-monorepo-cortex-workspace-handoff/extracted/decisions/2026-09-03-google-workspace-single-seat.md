---
id: decision.2026-09-03-google-workspace-single-seat
title: One Google Workspace seat, admin@levapp.app, as the company identity
date: 2026-09-03T16:00:00Z
provenance:
  - derives_from: archive/documents/2026-09-03-monorepo-cortex-workspace-handoff/source.md
  - derives_from: claude-sessions/pedro/session_0198iAmzyjfYiqu3DJSzaLLC
---

# One Google Workspace seat, admin@levapp.app, as the company identity

On 2026-09-03 the owner bought Google Workspace Business Starter for `levapp.app` — one seat, not one per founder — after learning the price is €8.10 per user per *month*, not per year. The existing `padellevelup2026@gmail.com` account was upgraded in place (not a new tenant), so it became `admin@levapp.app` while keeping ownership of Google Cloud, Cloudflare and the Chrome profile used for automation; the old Gmail address remains an alias. `noreply@` and `hello@` are free aliases on that seat; founder mailboxes are deferred ("if the other founders want"). Other services (GitHub org billing, Docker Hub, Cloudflare profile, Expo, Linear, Anthropic, OpenRouter) are to be re-pointed to `admin@levapp.app` by changing their email, never by creating new accounts — Docker Hub's `padelapp` namespace in particular is baked into every image name and workflow. The Apple Developer team stays an Individual account until a legal entity exists. DMARC starts at `p=none` and tightens after DKIM has run for a week.
