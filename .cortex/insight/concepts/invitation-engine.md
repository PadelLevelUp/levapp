The vacancy-filling invitation system end to end: when a seat opens (a decline, a no-show, a manual vacancy), the engine ranks eligible candidates, invites them in gated waves through one delivery chokepoint, retires competing offers the moment a seat fills, and sweeps stale/inactive vacancies on a periodic scheduler tick. It spans the full stack — persistent config and state in the models, the ranking/delivery/sweep logic in the services, thin route plumbing in the API layer, a client SDK, and settings UI on both web and (via the shared coach-only settings gate) mobile. This concept is deliberately broad: it unifies what earlier extraction passes proposed separately as "invitation-and-vacancy-engine-config", "invitation-engine", "invitation-vacancy-engine", "notification-engine-client", "notification-engine-settings" and "auto-invite-engine-config" — all facets of the same one system. [[eligibility-bar]] (who may join at all) and [[semi-automatic-approval]] (the coach-in-the-loop variant of a fill) are deliberately kept as separate, related concepts rather than folded in here, because they are distinct mechanisms layered on top of this engine rather than the engine itself.

## Implemented by
`backend/padel_app/models/notification_config.py`
`backend/padel_app/models/vacancy.py`
`backend/padel_app/models/notification_event.py`
`backend/padel_app/models/replacement_approval_prompt.py`
`backend/padel_app/models/waiting_list_entry.py`
`backend/padel_app/models/standing_waiting_list_entry.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/replacement_approval_service.py`
`backend/padel_app/scheduler.py`
`backend/padel_app/modules/notification_engine_api.py`
`frontend/packages/api/src/resources/notificationEngine.ts`
`frontend/packages/hooks/src/useAutoInviteEnabled.ts`
`frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`
`frontend/apps/web/src/components/settings/StandingWaitingListSection.tsx`
`frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`
`frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts`
`frontend/apps/web/e2e/notification-engine/manual-notify-selection.spec.ts`
`frontend/apps/web/e2e/notification-engine/standing-waitlist-expired.spec.ts`
`frontend/apps/web/e2e/settings/ticket-pad-109-standing-waitlist-search.spec.ts`
`frontend/apps/web/e2e/schedule-calendar/guest-list-dedupe.spec.ts`

## Related concepts
[[eligibility-bar]]
[[semi-automatic-approval]]
[[reminder-lifecycle]]
[[level-ladder-adjacency]]
[[coach-only-settings-gating]]
