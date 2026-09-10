---
id: clubs.courts
status: implemented
depends_on: [clubs.crud, classes.create, classes.edit]
implements: ../../specs-business/clubs/coach-runs-a-club-and-its-team.business.md
governed_by: [R-022, R-024]
---

# clubs.courts


### Intent
A club has courts ("Campo 1", "Campo 2"), and a class can say which court it happens on. That is
useful to students and coaches on the day, and it is the first step towards clubs managing their
own courts on the platform later. Owner decision (PAD-194, 2026-09-09): **minimal v1** — courts are
a name and an order per club, managed by the club's coaches in Settings → Club; a class carries an
optional court; the class forms let the coach pick it; the calendar cards and the class detail show
the club and the court. Nothing else (court availability, booking, per-occurrence court changes)
is in scope.

### Entities
- **Court** (`courts`): `id`, `club_id` (FK → `clubs.id`, ON DELETE CASCADE), `name` (String(80),
  NOT NULL), `position` (Integer, NOT NULL, default 0 — the display order). UNIQUE (`club_id`,
  `name`).
- **Lesson** — new column `court_id` (FK → `courts.id`, ON DELETE SET NULL, nullable). A
  `LessonInstance` reads its court from its lesson; there is no per-occurrence override in v1.
- **READS:** Club, Association_CoachClub (membership check).

### Rules
1. **Courts belong to a club and are managed by its coaches.** Every court route checks that the
   caller is a coach of that club (`coach_in_club`); anyone else gets 403. A student never reaches
   these routes.
2. `GET /app/club/<club_id>/courts` answers the club's courts ordered by `position`, then `id`:
   `[{"id", "clubId", "name", "position"}]`.
3. `POST /app/club/<club_id>/courts` `{"name"}` creates a court at the end of the order (201). The
   name is trimmed, 1–80 characters, and unique within the club case-insensitively; a duplicate or
   empty name is 400 `{"error": …, "code": "invalid_court"}`.
4. `PATCH /app/courts/<court_id>` `{"name"?}` renames (same validation). `DELETE
   /app/courts/<court_id>` removes the court (204); classes on that court keep running with no
   court (`court_id` becomes NULL), nothing else changes.
5. `PUT /app/club/<club_id>/courts/order` `{"ids": [...]}` sets `position` to the index of each id;
   the list must contain exactly the club's court ids, else 400 `invalid_court`.
6. **A class may carry a court.** `POST /app/add_class` and `POST /app/edit_class` accept an
   optional `courtId` (null clears it). The court must belong to the class's club, else 400
   `{"error": …, "code": "court_not_in_club"}` and nothing is written. An edit that omits
   `courtId` leaves the court as it is. Splitting a series ("this and future") copies the court
   onto the new series.
7. **Cards and details show club and court.** Calendar events (`serialize_calendar_event`, Lesson
   and LessonInstance) carry `club: {"id", "name"}` and `court: {"id", "name"} | null`; the class
   detail payload carries `clubName`, `courtId` and `courtName`. Web and iOS event cards render a
   "Club · Court" line under the title (club alone when there is no court) and the class detail
   shows the same pair; the class create and edit forms on both shells offer a **Court** select
   listing the coach's current club's courts, with "No court" as the first option.
8. **Settings → Club (web and iOS, R-024).** The Club section gains a **Courts** block: the ordered
   list with rename, move up/down and delete, an input plus **Add court**, and an empty line that
   says the club has no courts yet. Validation errors are shown inline.

### Acceptance Criteria

#### Courts are managed by the club's coaches only
- **Given** coach A in club 1 and coach B in club 2
- **When** A POSTs `/app/club/1/courts` `{"name": "Campo 1"}` then `{"name": "Campo 2"}`
- **Then** both are 201 and `GET /app/club/1/courts` lists them in order with positions 0 and 1
- **When** B GETs `/app/club/1/courts` or POSTs to it
- **Then** each response is 403
- **When** a student calls any court route
- **Then** the response is 403

#### Names are validated
- **Given** club 1 with "Campo 1"
- **When** A POSTs `{"name": "  campo 1 "}` or `{"name": ""}` or a 90-character name
- **Then** each is 400 `invalid_court` and the club still has one court

#### Rename, reorder, delete
- **Given** club 1 with "Campo 1" (id 1) and "Campo 2" (id 2)
- **When** A PATCHes `/app/courts/2` `{"name": "Campo central"}`
- **Then** the court is renamed
- **When** A PUTs `/app/club/1/courts/order` `{"ids": [2, 1]}`
- **Then** the list comes back as "Campo central", "Campo 1"
- **When** A PUTs `{"ids": [2]}`
- **Then** the response is 400 `invalid_court` and the order is unchanged
- **When** A DELETEs `/app/courts/1`
- **Then** the response is 204 and only "Campo central" remains

#### A class carries a court
- **Given** club 1 with court "Campo 1" (id 1) and club 2 with court "Outro" (id 9)
- **When** A creates a class with `courtId: 1`
- **Then** the calendar event answers `court: {"id": 1, "name": "Campo 1"}` and `club: {"id": 1, "name": …}`
- **When** A creates a class with `courtId: 9`
- **Then** the response is 400 `court_not_in_club` and no lesson exists
- **When** A edits the class with `updates: {"courtId": null}` (scope all)
- **Then** the event's `court` is null; an edit without `courtId` leaves it null

#### Deleting a court keeps its classes
- **Given** a class on "Campo 1"
- **When** A DELETEs the court
- **Then** the class still exists and its event carries `court: null`

#### Migration
- **Given** the migration source
- **Then** `courts` is created only if absent and `lessons.court_id` is added only if absent

#### The coach manages courts in Settings on web
- **Given** the seeded coach on Settings → Club
- **When** they add "Campo 1" and "Campo 2", move "Campo 2" up, rename it, and delete "Campo 1"
- **Then** the list reflects each step and a reload shows the same
- **When** they add a duplicate name
- **Then** an inline message says the name is taken

#### A class shows its club and court on web
- **Given** club courts "Campo 1"
- **When** the coach creates a class and picks "Campo 1"
- **Then** the calendar card shows "E2E Club · Campo 1" and the class detail shows the same

#### Same on iOS
- **Given** the coach in the app
- **Then** Settings → Club offers the Courts block, class creation offers the Court select, and the
  card and class detail show club and court

### Notes
- Source: PAD-194 (owner decision: minimal v1, 2026-09-09).
- Out of scope, as follow-ups: court availability/booking, a per-occurrence court change, clubs
  managing their own courts without a coach, multiple clubs on one screen.
- The coach's *current* club is what the class forms list courts for; a class always belongs to the
  club it was created in (`clubs.crud` rule 5), so the court list and the class agree.
