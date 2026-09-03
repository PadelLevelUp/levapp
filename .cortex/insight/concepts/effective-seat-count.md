`LessonInstance.effective_filled_spots` is the single shared source of truth for how full a class is — calendar participant counts, class-detail capacity, and the [[invitation-engine]]'s capacity checks all defer to it rather than recomputing occupancy themselves (PAD-71). A decline frees a seat; a non-response does not. The same property crosses into the frontend as `effectiveFilledSpots`, re-exported from `@levelup/config`'s `capacity.ts` and consumed directly by the web calendar page.

## Implemented by
`backend/padel_app/models/lesson_instances.py`
`backend/padel_app/services/lesson_service.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/tests/test_calendar_participant_count.py`
`backend/padel_app/tests/test_class_guest_list_dedupe.py`
`frontend/packages/config/src/capacity.ts`
`frontend/apps/web/src/pages/CalendarPage.tsx`

## Related concepts
[[calendar-visual-state]]
[[lazy-instance-materialisation]]
