---
id: calendar.seasons
status: implemented
depends_on: [calendar.view, classes.create]
implements: ../../specs-business/calendar/coach-relies-on-calendar.business.md
governed_by: []
---

# calendar.seasons


### Intent
A coach defines named "seasons" (a name plus an absolute start and end date) in Settings → Calendar.
A recurring class can then be set to "recur until season end" instead of carrying a manually typed end
date, and instance generation stops at the owning coach's season end.

Seasons shipped with PAD-8 but were never specced; PAD-89 closes that gap and fixes the write contract.
The batch write path treated an omission as a deletion — a persisted season absent from the payload was
silently destroyed rather than validated against — while the DB-aware overlap validator that PAD-8
shipped (`validate_no_overlap`) was never called by any production code path. Because the web client
never sent `id`, every "Save seasons" click deleted and re-created the coach's entire set.

### Entities
- **Season** (`seasons`): `id`, `coach_id` (FK → `coaches.id`, ON DELETE CASCADE), `name`, `start_date`,
  `end_date`. Owned by exactly one coach. Nothing else in the schema references a season by id.

### Rules
1. A coach's seasons must never overlap. The check is inclusive: two ranges overlap when
   `start_a <= end_b and start_b <= end_a`. Adjacent ranges (one starting the day after the other ends)
   do not overlap.
2. `start_date` must be on or before `end_date`.
3. `POST /app/add_seasons` is a **pure upsert**. An entry carrying an `id` owned by the coach updates
   that season in place, preserving its identity and `created_at`; an entry without an `id` creates one.
4. **Explicit deletes only.** A persisted season the payload does not mention is left untouched. Batch
   save never deletes. Removal happens solely through `POST /app/delete/season`.
5. Overlap validation runs in two passes before anything is written: pairwise across the incoming
   payload, then — via the DB-aware validator — each entry against the coach's persisted seasons that
   the payload does not address. Seasons the payload *does* address are excluded from the second pass so
   a season is never treated as overlapping its own stale range.
6. Any violation rejects the **whole batch** with 400 and writes nothing. A payload can never resolve an
   overlap by destroying the season it collides with.
7. The web client sends `id` for every already-persisted row so rule 3 applies; locally-added rows are
   posted without one.
8. **"Recurs until season end" fails closed.** When a class is created with `recursUntilSeasonEnd`,
   `POST /app/add_class` resolves the coach's season covering the class's start date and snapshots that
   season's `end_date` into `lessons.recurrence_end`. If no season covers that date, the create is
   rejected with 400 and `{"error": …, "code": "no_season_covers_date"}`; no lesson, instance or
   reminder job is written. A fallback horizon is deliberately NOT used — a silently invented end date
   is as surprising as no end date.
9. **`recurs_until_season_end` implies a bounded recurrence.** A lesson flagged
   `recurs_until_season_end` must never carry a NULL `recurrence_end`. NULL is read everywhere
   downstream (`helpers/calendar_helpers.py`) as "no end", which makes the class recur forever.
10. The coach-facing surface (`AddClassSheet`) presents a `no_season_covers_date` rejection **in
    place**: the sheet stays open with every field intact and renders a localized message beside the
    toggle telling the coach to set a season or turn the toggle off and pick an end date. It is not a
    toast — a toast disappears and the sheet would already have closed over a class that was never
    created.

### Acceptance Criteria

#### A season omitted from the payload survives
- **Given** a coach with a persisted season "Existing" (2026-03-01 → 2026-05-31)
- **When** they save a payload containing only a new, non-overlapping season "Autumn" (2026-09-01 → 2026-12-31)
- **Then** the request succeeds
- **And** both "Existing" and "Autumn" are present afterwards

#### A new season overlapping an omitted persisted season is rejected
- **Given** a coach with a persisted season "Existing" (2026-03-01 → 2026-05-31)
- **When** they save a payload containing only "New" (2026-05-15 → 2026-08-01)
- **Then** the response status is 400 with "Overlapping seasons are not allowed"
- **And** "Existing" is still present and "New" was not created

#### A season can be moved over its own former range
- **Given** a coach's persisted season "Spring" (2026-03-01 → 2026-05-31)
- **When** they save it by `id` with the range 2026-03-15 → 2026-06-30
- **Then** the save succeeds and the row keeps its original `id`

#### Two overlapping seasons in one payload are rejected
- **Given** any coach
- **When** they save 2026-03-01 → 2026-05-31 together with 2026-05-15 → 2026-08-01
- **Then** the response status is 400 and neither season is created

#### Removal is explicit
- **Given** a coach with two seasons
- **When** they delete one through `POST /app/delete/season`
- **Then** only that season is removed and the other is untouched

#### Persisted rows are saved in place
- **Given** a coach with a persisted season shown in Settings → Calendar
- **When** they click "Save seasons"
- **Then** the posted payload carries that season's `id`

#### "Recurs until season end" with no season at all is rejected
- **Given** a coach with zero seasons (the default state)
- **When** they create a recurring class with `recursUntilSeasonEnd: true`
- **Then** the response status is 400 with `code: "no_season_covers_date"`
- **And** no lesson is created

#### "Recurs until season end" outside every season is rejected
- **Given** a coach whose only season is 2026-01-01 → 2026-05-31
- **When** they create a recurring class starting 2026-06-15 with `recursUntilSeasonEnd: true`
- **Then** the response status is 400 and no lesson is created

#### A covering season bounds the recurrence
- **Given** a coach with a season 2026-06-01 → 2026-09-30
- **When** they create a recurring class starting 2026-06-15 with `recursUntilSeasonEnd: true`
- **Then** the lesson is created with `recurrence_end` = 2026-09-30

#### The coach is told in the sheet, not by a vanishing toast
- **Given** a coach creating a recurring class on a date no season covers
- **When** they enable "recurs until season end" and submit
- **Then** the Add Class sheet stays open with the class name and other fields intact
- **And** a message beside the toggle explains that no season covers this date
- **And** turning the toggle off clears the message, and picking an end date lets the class save

### Notes
- Source: tickets PAD-8 (feature), PAD-89 (write-contract fix), PAD-90 (fail-closed resolution),
  PAD-83 (investigation).
- Rules 8–10 cover the create path only (`add_class_service`); no edit path can set
  `recurs_until_season_end`.
- The DB has no unique/exclusion/check constraint on `seasons` — rules 1–2 are enforced only in the
  service layer, so the generic-CRUD write paths bypass them entirely (tracked separately as PAD-88).
- PAD-82 will replace this multi-row model with a single recurring day/month season per coach. The
  contract above is deliberately forward-compatible: an upsert that never deletes and a validator that
  actually runs both survive that redesign unchanged.
