Every recurring class must be covered by a season, and season CRUD must fail closed rather than silently allow gaps or overlaps: `validate_no_overlap` rejects a season write that would overlap a coach's existing seasons, and class creation raises `NoSeasonCoversDateError` rather than materializing occurrences past a season's end (PAD-89/90) — recurrence is capped at the covering season's boundary, never left open-ended. Web's season editor in Settings hand-rolls its own axios calls (`api/seasons.ts`) directly against `frontend_api.py` rather than going through a shared `@levelup/api` resource module, unlike every other domain the web app touches.

## Implemented by
`backend/padel_app/services/season_service.py`
`backend/padel_app/tests/test_season_service.py`
`backend/padel_app/tests/test_recurs_until_season_end.py`
`frontend/apps/web/src/api/seasons.ts`
`frontend/apps/web/e2e/calendar/season-end-no-season.spec.ts`
`frontend/apps/web/e2e/settings/season-upsert-safety.spec.ts`

## Related concepts
[[lazy-instance-materialisation]]
