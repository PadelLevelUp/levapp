The coach-home dashboard is composed of independent, named blocks (next class, needs-you queue, schedule, week pulse, pending confirmations) rather than one monolithic view, on both platforms: web assembles them via a block renderer over `dashboard/coach/*` and `dashboard/blocks/*` components, and mobile's `DashboardBlocks`/`CoachDashboard` are the documented iOS port of the same block set (per the CLAUDE.md "web and iOS ship together" rule). Every block is backed by its own backend builder function rather than one combined endpoint.

## Implemented by
`backend/padel_app/helpers/dashboard/coach_home.py`
`backend/padel_app/helpers/dashboard/pending.py`
`backend/padel_app/tests/test_dashboard_coach_home.py`
`backend/padel_app/tests/test_dashboard_pending_confirmations.py`
`frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx`
`frontend/apps/web/src/components/dashboard/blocks/PendingConfirmationsBlock.tsx`
`frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx`
`frontend/apps/mobile/src/features/dashboard/CoachDashboard.tsx`
`frontend/apps/web/e2e/dashboard/coach-dashboard.spec.ts`
`frontend/apps/web/e2e/dashboard/dashboard-i18n.spec.ts`
`frontend/apps/web/e2e/dashboard/pending-confirmations.spec.ts`

## Related concepts
[[web-mobile-parity]]
