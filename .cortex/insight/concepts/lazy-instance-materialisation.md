A recurring `Lesson` template only becomes a concrete `LessonInstance` row the first time something needs to act on a specific occurrence — presence confirmation, an edit, a reminder send. The lookup key is `original_lesson_occurence_date`, never a naive datetime reconstruction, specifically to avoid materializing the same occurrence twice under concurrent access (PAD-85, contained further by a savepoint per PAD-117). Every caller that might touch either a plain `Lesson` or an already-materialized `LessonInstance` for the same logical occurrence must branch on the event's actual model field rather than a payload key the two shapes happen to share — PAD-64's bug was exactly that wrong branch.

## Implemented by
`backend/padel_app/services/lesson_service.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/training_service.py`
`backend/padel_app/services/import_service.py`
`backend/padel_app/tests/test_pad117_savepoint_containment.py`
`backend/padel_app/tests/test_pad85_duplicate_materialization.py`
`backend/padel_app/tests/test_recurring_delete_exclusion.py`
`frontend/apps/web/e2e/schedule-calendar/recurring-occurrence-delete.spec.ts`
`frontend/apps/web/e2e/schedule-calendar/attendance-save.spec.ts`
`frontend/apps/web/e2e/schedule-calendar/class-deletion.spec.ts`

## Related concepts
[[effective-seat-count]]
[[reminder-lifecycle]]
