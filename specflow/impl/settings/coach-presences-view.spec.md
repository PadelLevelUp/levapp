---
id: settings.coach-presences-view
status: draft
depends_on: [settings.role-scope, attendance.validation]
serves: [P-ATTENDANCE-1]
governed_by: []
---

# settings.coach-presences-view

### Intent
A coach's choice of columns on the Presences tab is kept on their account, so it comes back on
every open, on web and on iOS alike (PAD-837 part 3). Today the choice is React state on both
shells and is lost on reload. It lives under settings because it is a stored per-coach preference
with the same shape as `settings.coach-working-hours` (a JSON column on `Coach`, a GET and a PUT).
It serves the attendance outcome, not a Settings section, as `settings.tutorials` serves a
notifications one.

### Entities
- **Coach** (`coaches`): `presences_view` (JSON, nullable; one migration, parented on staging's
  head at implementation time, checked with `flask db heads`). Shape: `{"columns": ["total", "private", ...]}`. **null means not set**,
  and the shells show the column list's defaults (`attendance.validation` rule 17c).

### Rules
1. `GET /app/coach/presences-view` (coach only, as `require_coach()`) answers
   `{presencesView: <json or null>}`. `PUT /app/coach/presences-view {presencesView}` replaces the
   whole value; `{presencesView: null}` clears it back to "not set". A student gets 403 on both.
2. **The server checks the shape, not the ids.** `columns` is a list of distinct strings, at most
   32, each at most 40 characters; anything else is `400 INVALID_PRESENCES_VIEW`. The server does
   not hold the column list: the list is the shells' (`@levelup/config`, rule 17c), and a second
   copy in Python would be one more place for the ids to drift. **Why:** a column added or retired
   in a later release must not make an older saved view unreadable or a newer one unsavable.
   Beyond `columns`: a PUT body that is not an object, or has no `presencesView` key, is
   `400 INVALID_PRESENCES_VIEW` too, so a malformed request never reads as "clear it"
   (`{presencesView: null}` is the one way to clear). Keys beside `columns` are not checked and are
   stored as sent, so a later field (a sort, a period) never needs a server change. An empty-string
   id is accepted, as is an empty list: the server sets no minimum length.
3. **The shells read the saved value against the column list.** An id the list does not know is
   ignored; `name` is shown whether or not it is stored (it is pinned, `attendance.validation`
   rule 17); the columns show in the list's order, whatever order was stored; a stored empty list
   shows `name` alone. A null value, or a load that fails, shows the list's defaults.
4. **What is saved, and when.** Only which columns show. Web saves when the coach changes the
   chooser; iOS when the coach applies the columns sheet (rule 17: the sheet commits on Apply).
   Each save sends the whole list. This is a choice made on the Presences tab, not a Settings
   form: `settings.explicit-save` (one "Guardar alterações" per Settings tab) does not apply, and
   there is no Settings section for it.
5. **A load never undoes a choice** (the `settings.coach-working-hours` rule 7 precedent, PAD-392).
   The view is fetched once per mount, and a load that resolves after the coach has changed the
   columns does not replace them.
6. **A save that fails says so.** The screen keeps the columns the coach chose and a notice says
   they were not saved; the next open shows what the server holds.

### Not this spec
- Column order chosen by the coach: the order is the list's (`attendance.validation` rule 17c;
  proposed in that spec's Open questions, an owner question).
- Saving the sort or the period (`attendance.validation` Open questions, Q5; proposal: neither).
- A Settings section to edit or reset the view.
- Android as its own lane: the Expo app is the same as iOS.

### Today
- Column choice is `useState` only: web `PresencePlayersTable.tsx:88`
  (`useState<ColumnKey[]>(DEFAULT_VISIBLE)`), iOS `PresencesScreen.tsx:101`
  (`useState<PresenceColumnKey[]>(DEFAULT_VISIBLE_COLUMNS)`). Nothing in presences uses
  localStorage or AsyncStorage.
- The two shells declare the same eight ids twice (`COLUMNS`, `PRESENCE_COLUMNS` in
  `report-state.ts:28`), with the same defaults (`name`, `total`, `private`, `academy`,
  `unjustified`). Order is fixed: the chooser toggles visibility, `toggleColumn` re-sorts into list
  order.
- The precedent: `Coach.working_hours` (JSON, migration `8da963ad8591`), `GET/PUT
  /app/coach/working-hours` (`backend/padel_app/modules/frontend_api.py:2226`, `:2238`),
  `@levelup/api` `workingHoursApi` (`packages/api/src/resources/workingHours.ts`).

### Acceptance Criteria

#### SETTINGS-COACH-PRESENCES-VIEW-1: A coach saves a view and reads it back
- **Given** coach Ana has never saved a view
- **When** she reads it
- **Then** the answer is `presencesView: null`
- **When** she saves `{"columns": ["total", "presenceMinutes", "justified"]}` and reads it again
- **Then** she gets exactly that; saving `null` returns it to `null`
- **And** a student gets 403 on the GET and the PUT
test: `backend/padel_app/tests/test_pad837_presences_view.py` › `test_a_coach_saves_and_reads_back_the_view`

#### SETTINGS-COACH-PRESENCES-VIEW-2: A malformed view is refused and nothing is stored (rule 2)
- **Given** a saved view
- **When** the coach sends `columns` as a string, with a duplicate, with 33 ids, with a 41-character id, or with a number in it
- **Then** each answer is `400 INVALID_PRESENCES_VIEW` and the stored view is unchanged
- **And** an id no shell knows (`"retiredColumn"`) is accepted
test: `backend/padel_app/tests/test_pad837_presences_view.py` › `test_a_malformed_view_is_refused`

#### SETTINGS-COACH-PRESENCES-VIEW-3: The shells read any stored view safely (rule 3)
- **Given** stored views `null`, `{"columns": ["retiredColumn", "justified"]}`, `{"columns": ["invitesJoined", "total"]}` and `{"columns": []}`
- **When** a shell resolves the columns to show
- **Then** it shows the defaults; `name` and `justified`; `name`, `total` and `invitesJoined` in the list's order; and `name` alone
test: `frontend/packages/config/src/presence-columns.test.ts` › `resolves a stored view against the column list`

#### SETTINGS-COACH-PRESENCES-VIEW-4: A late load does not undo a choice (rule 5)
- **Given** the coach opens the Presences tab and the view's GET is slow
- **When** she hides "Aulas privadas" before it answers
- **Then** "Aulas privadas" stays hidden after it answers, and the view was fetched once
test: `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `keeps a choice made before the view loaded` (+ `frontend/apps/mobile/src/features/presences/presences-view.test.ts` › `keeps a choice made before the view loaded`)

#### SETTINGS-COACH-PRESENCES-VIEW-5: A failed save is said, not hidden (rule 6)
- **Given** the PUT answers 500
- **When** the coach adds a column
- **Then** the column stays shown and a notice says the choice was not saved
test: `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `says when the view was not saved` (+ `frontend/apps/mobile/src/features/presences/presences-view.test.ts` › `says when the view was not saved`)

### Waves
1. SETTINGS-COACH-PRESENCES-VIEW-1, 2: the migration (written only on the lead's go; one Alembic
   head, checked with `flask db heads`), the model column, the two routes.
2. SETTINGS-COACH-PRESENCES-VIEW-3: the resolver beside the column list in `@levelup/config`
   (after `attendance.validation` wave 837a lifts the list).
3. SETTINGS-COACH-PRESENCES-VIEW-4, 5, then ATTENDANCE-VALIDATION-66: `@levelup/api`, a hook in
   `@levelup/hooks`, web and iOS.

### Open questions
- None of its own. What else is saved (sort, period) is `attendance.validation` Q5.
