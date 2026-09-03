---
path: frontend/apps/web/e2e/dashboard/coach-dashboard.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 57
size_tokens: 560
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dc00c1427de19e527b594c723c9b8d2062ed75d472dcb7e2038b15c6c8957ec5"
---

## Purpose

US-62 through US-65 baseline smoke coverage for the coach dashboard's
block-based layout: KPI cards, the `schedule_7d` upcoming-classes widget
(rendered even when empty), an unread-messages indicator, and the "needs
you" queue that replaced the old notification-activity feed. Several
assertions self-skip when a locator isn't found, since some dashboard
content is data-dependent.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openDashboard`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `/api/app/dashboard` endpoint;
  `.specflow/specs/dashboard/blocks.spec.md`; `dashboard-i18n.spec.ts` and
  `upcoming-class-deeplink.spec.ts` extend this same dashboard surface.
