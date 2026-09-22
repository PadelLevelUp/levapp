---
id: evaluations.records
status: implementing
depends_on: [evaluations.entries, evaluations.competencies, evaluations.legacy-client-contract, classes.instances]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.records

### Intent
An evaluation is one record: everything a coach rated about one player on one occasion, one
private note, and optionally the class it happened in (AV-001). Ratings stay rows of
`evaluation_entries`; the record groups them. It is what history lists, what sharing shares and
what every writer — new, legacy and import — goes through.

### Entities
- **CREATES:** EvaluationRecord (`evaluation_records`)

  | column | type | meaning |
  |---|---|---|
  | `id` | int PK | server-minted (AV-078) |
  | `coach_player_id` | FK → `coach_in_player` CASCADE, NOT NULL | evaluations belong to the coach–player link (build default Q20) |
  | `lesson_instance_id` | FK → `lesson_instances` SET NULL, NULL | the dated occurrence (build default Q15); NULL = made outside a class |
  | `evaluated_on` | date NOT NULL | "the day" — rule 3 |
  | `note` | text NULL | one private note (AV-007) |
  | `created_at`, `updated_at` | datetime | the model base's columns, as on every table (a new table without `updated_at` passes on SQLite and fails on Postgres) |

  Two **partial unique indexes**: `(coach_player_id, evaluated_on) WHERE lesson_instance_id IS
  NULL` and `(coach_player_id, lesson_instance_id, evaluated_on) WHERE lesson_instance_id IS NOT
  NULL`. **Both must be enforced on SQLite and on Postgres** — the backend suite runs on both, so
  the migration and the model declare them in a form each dialect honours (`sqlite_where` and
  `postgresql_where`), and rule 2's duplicate criterion runs on both.
- **WRITES:** EvaluationEntry — gains `record_id` FK → `evaluation_records` CASCADE, NULL, with a
  partial unique index `(record_id, category_id) WHERE record_id IS NOT NULL` (same two-dialect
  requirement). LessonInstance (materialised on first write, rule 4).
- **READS:** EvaluationCategory, Association_CoachPlayer, Lesson, Presence.
- One migration (with `evaluations.competencies`' columns): idempotent, every DDL guarded,
  dry-run on a production-shaped database before merge.

### Rules
1. **Data survival.** No existing row of `evaluation_entries` or `evaluation_categories` is
   deleted, rescaled, re-dated or re-scored by the migration, the backfill or any writer here. On
   an existing entry row only `record_id` is ever written.
2. **(AV-002, build default Q27) Identity: coach–player link + class-or-none + the day.** The
   first rating or note of the day for a player in a given class occurrence creates the record;
   later input the same day merges into it. Another occurrence, or no class, is another record;
   the next day starts a new one. A class record and a class-less record of the same day are two
   records and two history cards, as in the canvas (AV-073).
3. **(PAD-363, build default Q10) "The day" is the calendar date in the app's configured club
   zone** — `CLUB_TZ`, the same wall-clock zone class times use — applied to the naive-UTC
   `evaluated_at`. No per-coach zone exists. The legacy path keeps stamping `evaluated_at =
   utcnow`; only the *date* a record is filed under is local.
4. **(AV-008, build default Q15) The class link is the dated occurrence, never the series.**
   `classRef` is `{model, id, date}` as the calendar identifies an occurrence (`model:
   "LessonInstance"` with its id, or `model: "Lesson"` with the series id and the date). An
   occurrence with no row is materialised through `get_or_materialize_instance(lesson, date)` on
   the **first write — but only an occurrence dated today or later on the club-zone calendar**.
   For a **past** occurrence that was never materialised the write answers **409**
   `class_not_materialised` and creates nothing: materialising creates the instance, enrols the
   whole series roster as unmarked presences and adds every standing-waiting-list player to that
   class's waiting list (it sends nothing; past-dated jobs are skipped — read from
   `_sync_standing_entries_for_new_instance` and `scheduler.py` during PAD-363), and rating one
   player must never do that to a class that is over. An already materialised occurrence, past
   or not, is used as it is. Reading the class panel materialises nothing. The coach must own the
   class (`classes.detail-visibility`'s owner check), else 403; an unknown class → 404.
   `evaluated_on` is today (rule 3), not the occurrence's date.
5. **(AV-005) A record holds only what the coach rated.** An untouched competency writes nothing
   (PAD-337's guarantee, `evaluations.entries` rule 6, carried over unchanged).
6. **(AV-007, AV-078) One private note per record**, at most 2000 characters (longer → 400). A
   note with no rating still creates a record. The note reaches a player only if the coach
   includes it in a share (`evaluations.sharing`).
7. **(AV-004) Tap to save.** Every star tap and every note edit (debounced on the client) is its
   own `PUT`; there is no save button and no dirty state. "Concluir avaliação" only closes the
   form. The write is a get-or-create on rule 2's identity, so a repeated or concurrent call
   never creates a second record (the unique indexes are the backstop; a lost race re-reads).
8. **The write endpoint.** `PUT /api/app/evaluation_record` (JWT, coach). Request
   `{playerId, classRef: null | {model, id, date}, ratings: {<categoryId>: int|null}, note?,
   recordId?}` (`recordId`: rule 11).
   Response: `Record`, or `{deleted: true}` when nothing is left (rule 10).
   `Record = {id, evaluatedOn, classInstanceId|null, className|null, note, editable,
   ratings: [{categoryId, name, key|null, score, scaleMin, scaleMax}],
   share: null | {sharedAt, categoryIds, evolution, includeNote}}`.
   A player not on the coach's roster → 404; a caller with no coach profile → 403; a
   `categoryId` that is not the coach's → 403. It is a merge: a competency absent from `ratings`
   is untouched. Within a record a competency has one entry row: rating it again the same day
   updates that row's `score` and `evaluated_at` in place. A value equal to the competency's
   latest score on an earlier day **is written** — "still a 4" is a rating; the equal-to-latest
   skip belongs to the legacy handler only (rule 12).
9. **The range rule lives here and only here.** A rating must be an integer within the
   competency's `[scale_min, scale_max]`, else **400** and nothing in the request is written
   (the write is atomic). This resolves **B-126** for new writes; `/add_evaluation_entry` stays
   unchecked while 1.0/1.1.0 live.
10. **(AV-006 overruled, build default Q8) A rating can be cleared.** `ratings: {<id>: null}`
    (the shells: tapping the lit star) deletes that record's entry for the competency; `note:
    ""` or `note: null` clears the note. A record left with no rating and no note is deleted and
    the response is `{deleted: true}`.
11. **(build default Q9) Editable on its day only.** `editable` is true while `evaluated_on` is
    today (rule 3). A `PUT` resolves to today's record by identity, so it can never change a
    past one. A client that has a record open may send its id as `recordId`; if that record's
    `evaluated_on` is no longer today (the form stayed open across midnight) the answer is
    **409** and nothing is written, instead of silently starting a new day's record. After its
    day the only action on a record is `DELETE /api/app/evaluation_record/<id>`
    → `{status: "ok"}`: coach-owned (else 403), deletes the record and its entries, and removes
    any share of it **(pending owner decision Q6)**. The shells confirm first.
12. **One writer: `evaluation_record_service`.** `PUT /evaluation_record`, the legacy
    `POST /add_evaluation_entry` and the import all write entries through it, so every new entry
    has a record.
    - *Legacy:* the null and equal-to-latest skips stay in the legacy handler, in front of the
      service. An accepted score is appended as a new row (`evaluated_at = utcnow`, as today)
      into the day's class-less record; if that record already holds a row for the category, the
      new row takes its place and the earlier row is kept with `record_id` set to NULL — the same
      outcome the backfill gives a day with two rows (rule 13). **A legacy save never fails over
      record bookkeeping:** if two saves race for one slot, the loser's row is kept record-less
      rather than the request answering 500 — before records existed the same two requests
      simply appended two rows.
    - *Import (build default Q22):* rows are grouped by player and the row's date into
      class-less records; scores keep their scale.
13. **(PAD-363, owner question Q5) Backfill.** Existing entries are grouped by
    `(coach_player_id, local date of evaluated_at)` into class-less records. Per category, the
    row with the greatest `(evaluated_at, id)` joins the record; earlier rows of that category on
    that day keep `record_id` NULL. **(build default Q29) A record-less entry is kept and is read
    by nothing in the new API** — not by history, not by evolution, not by a share: a day's
    record has one value per competency, and an average never includes a number no card shows.
    The legacy reads (`current_evaluations`, `/player_profile`) are untouched. Only `record_id` is written on
    entry rows. The record's `created_at` / `updated_at` are the group's min / max
    `evaluated_at`; `note` is NULL. Re-running changes nothing. An **earlier** record-less row
    never displaces the row that holds a slot; a record-less row **later** than the holder (one
    written around the service during a deploy window) takes the slot and the former holder
    becomes record-less — the same outcome as rule 12's runtime append, and what the migration
    does by design, with a test (PAD-363). Backfilled records are shareable like any other **(pending owner decision Q5)**.
14. **The endpoint parses JSON directly and distinguishes absent / null / falsy.** It must not
    read or write through the shared form layer (`tools/input_tools.py` `Field.set_value`,
    `JsonRequestAdapter`, `model.update_with_dict`), which reads falsy as "not sent" (B-136).
    `ratings: {id: null}` clears; `note: ""` clears; an absent `note` or an absent competency
    changes nothing; a legal `0` on a legacy category whose minimum is 0 is saved as 0.
    Strengths and weaknesses are not accepted here; an unknown key is ignored.
15. **(AV-078) Ids and dates are the server's.** Dates on the wire are ISO (`evaluatedOn`:
    `YYYY-MM-DD`); the shells format them in the active locale.

### Touches
- `classes.instances` — its list of materialisation triggers gains "a coach's first evaluation
  write on an occurrence dated today or later" (slice 6). What materialising a past date does is
  in rule 4; what a coach may do with a past class that was never opened is
  `evaluations.class-panel` rule 10.
- `import.confirm` / `import.revert` — the import writes through the record service; revert must
  remove the records an import created and keep any record that also holds a hand-entered rating.
- `players.remove` — removing a player from a coach cascades to the link's records.

### Acceptance Criteria

#### One record groups a day's ratings and its note (rules 2, 7)
- **Given** coach Ana, her player Rui (id 5), active competencies Técnica (21), Tática (22),
  Consistência (23), on 2026-09-21
- **When** she sends `PUT /evaluation_record` three times with `classRef: null`:
  `{"playerId": 5, "ratings": {"21": 4}}`, `{"playerId": 5, "ratings": {"23": 3}}`,
  `{"playerId": 5, "ratings": {}, "note": "Boa sessão"}`
- **Then** one `evaluation_records` row exists for Rui's link with `evaluated_on` 2026-09-21 and
  `lesson_instance_id` NULL; the last response has ratings Técnica 4 and Consistência 3, note
  "Boa sessão", `editable: true`, `share: null`; Tática has no entry

#### 23:30 UTC in summer belongs to the next local day (rule 3)
- **Given** an entry with `evaluated_at` 2026-07-14 23:30:00 (naive UTC) and `CLUB_TZ`
  Europe/Lisbon (UTC+1 in July)
- **When** it is filed — by the backfill, or live through `/add_evaluation_entry` at that instant
- **Then** its record's `evaluated_on` is 2026-07-15, and the entry's `evaluated_at` is unchanged

#### A class record and a class-less record of one day are two records (rule 2)
- **Given** Ana rates Rui Técnica 4 with `classRef {"model": "LessonInstance", "id": 88, "date":
  "2026-09-21"}` and then Técnica 5 with `classRef: null`, both on 2026-09-21
- **Then** two records exist, one with `classInstanceId` 88 and `className` set, one with both null
- **And** a direct insert of a second class-less record for that link and day is refused by the
  database on SQLite and on Postgres

#### The first write materialises the occurrence (rule 4)
- **Given** a weekly class (lesson id 7) whose 2026-09-21 occurrence has no `lesson_instances` row
- **When** Ana sends `PUT /evaluation_record` with `classRef {"model": "Lesson", "id": 7, "date":
  "2026-09-21"}` and `ratings {"21": 4}`
- **Then** exactly one instance exists for `(7, 2026-09-21)` and the record's `classInstanceId`
  is its id; a second PUT with the same `classRef` creates no further instance and no second record

#### Rating a player never opens a class that is over (rule 4)
- **Given** the same weekly class, whose 2026-09-14 occurrence has no `lesson_instances` row, and
  today is 2026-09-21
- **When** Ana sends `PUT /evaluation_record` with `classRef {"model": "Lesson", "id": 7, "date":
  "2026-09-14"}` and `ratings {"21": 4}`
- **Then** the response is 409 `class_not_materialised`; no instance, presence, waiting-list
  entry, record or entry was created
- **And** the same PUT for the 2026-09-07 occurrence, which was materialised when attendance was
  taken (instance 80), is accepted and its record carries `classInstanceId` 80

#### Out-of-range and non-integer ratings are refused whole (rule 9, resolves B-126)
- **Given** Bandeja (id 12, 1–5) and Técnica (21)
- **When** Ana sends `ratings {"21": 4, "12": 6}`, then `{"12": 2.5}`, then `{"12": "abc"}`
- **Then** each answers 400 and nothing is written — not even Técnica 4

#### Clearing, empty strings and zeros mean what they say (rules 10, 14)
- **Given** today's record for Rui holds Técnica 4 and the note "Boa sessão", and Ana's legacy
  category "Resistência" (id 3) has scale 0–10
- **When** she sends `{"playerId": 5, "classRef": null, "ratings": {"3": 0}}`
- **Then** Resistência is saved with score 0, and Técnica and the note are unchanged
- **When** she sends `ratings {"21": null, "3": null}` with no `note` key
- **Then** both ratings are gone and the note is still "Boa sessão"
- **When** she sends `{"playerId": 5, "classRef": null, "ratings": {}, "note": ""}`
- **Then** the response is `{"deleted": true}` and the record no longer exists

#### The same value on a new day is recorded (rule 8)
- **Given** Técnica was rated 4 on 2026-09-14
- **When** Ana rates Técnica 4 on 2026-09-21
- **Then** two Técnica entries exist, one in each day's record

#### Yesterday's record is read-only (rule 11)
- **Given** a record with `evaluated_on` 2026-09-20, and today is 2026-09-21
- **When** Ana reads Rui's evaluations, then sends `PUT /evaluation_record` with `ratings {"21": 2}`
- **Then** the 2026-09-20 record has `editable: false` and is unchanged; the PUT created
  2026-09-21's record
- **When** she sends the same PUT with `"recordId": <the 2026-09-20 id>`
- **Then** the response is 409 and nothing is written
- **When** she sends `DELETE /evaluation_record/<the 2026-09-20 id>`
- **Then** the response is `{"status": "ok"}` and the record and its entries are gone

#### The backfill groups by local day and keeps every row (rules 1, 13)
- **Given** Rui's link holds entries: Forehand 7 at 2026-03-02 10:15, Forehand 8 at 2026-03-02
  18:40, Volley 5 at 2026-03-02 10:15, Forehand 9 at 2026-05-04 18:00
- **When** the backfill runs twice
- **Then** two class-less records exist: 2026-03-02 (Forehand 8, Volley 5; `created_at`
  2026-03-02 10:15, `updated_at` 2026-03-02 18:40) and 2026-05-04 (Forehand 9)
- **And** the Forehand 7 row still exists with `record_id` NULL, and no entry's `score`,
  `evaluated_at` or `category_id` differs from before
- **And** the second run wrote nothing

#### A legacy save lands in the day's class-less record (rule 12)
- **Given** today's class-less record for Rui holds Forehand 7 (written through `PUT`)
- **When** an App Store build posts `/add_evaluation_entry` with Forehand 9
- **Then** a new entry Forehand 9 is in that record, the Forehand 7 row still exists with
  `record_id` NULL, and no second record was created

### Notes
- OPEN: the 2000-character note limit is this leaf's choice; the canvas has none (AV-078).
- OPEN: `CLUB_TZ` is one zone for the whole app. If per-club or per-coach zones ever exist,
  rule 3 follows class times.
