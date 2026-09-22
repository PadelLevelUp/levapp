---
id: evaluations.reminders
status: implementing
depends_on: [evaluations.records, evaluations.class-panel, notifications.config, attendance.presence]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: [R-047, R-048]
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
---

# evaluations.reminders

> **Owner decision Q4 (2026-09-22, via the Coordinator): in-app markers only.** The canvas
> stores a frequency and never uses it; the owner chose the recommended default below — a
> marker inside the app, no push, no e-mail. Built by PAD-404 (slice 8). Every rule is binding.

### Intent
A coach says how often they want to be nudged to evaluate, and the app marks the players who are
due. It is a marker inside the app, never a message to anyone.

### Entities
- **WRITES:** NotificationConfig (`notification_configs`, one row per coach — where per-coach
  typed settings live), its own migration slot (slot 3, parent = slice 7's revision):

  | column | type | meaning |
  |---|---|---|
  | `evaluation_reminder_type` | varchar(16) NOT NULL DEFAULT `'never'` | `never` \| `monthly` \| `every_n_classes` (rule 7: the default reproduces today's behaviour) |
  | `evaluation_reminder_value` | int NULL | N, used by `every_n_classes` only |

  These are distinct from the existing `reminder_type` / `reminder_value` pair, which is the
  **class** reminder of `notifications.config` rule 4; the `evaluation_` prefix keeps them apart.
- **READS:** EvaluationRecord, Presence, LessonInstance, Association_CoachPlayer.

### Rules
1. **(AV-050) The setting "Frequência de avaliações"**, in the coach's Settings: "Nunca",
   "Mensalmente" (default), "A cada 2 aulas", "A cada 4 aulas", "Personalizado" → a number field
   with the suffix "aulas", hint "A cada quantas aulas queres ser lembrado", default 4. Caption:
   "O lembrete só ajuda a manter o histórico atualizado — a avaliação continua opcional."
   "A cada 2/4 aulas" and "Personalizado" are all `every_n_classes` with `everyN` 2, 4 or the
   typed number. Coach-only (`settings.role-scope` rule 3); web and iOS in the same ticket.
   The control reads back what is stored, not what was tapped: "Personalizado" with 2 or 4
   is the same setting as "A cada 2/4 aulas" and reopens as that option — intended, not a bug.
2. **The endpoint.** `GET /api/app/evaluation_settings` and `PUT /api/app/evaluation_settings`
   (JWT, coach) with `{reminder: 'never' | 'monthly' | 'every_n_classes', everyN?}` → the same
   shape. `everyN` is an integer 1–99, required with `every_n_classes` (else 400) and ignored
   otherwise; an unknown `reminder` → 400. The `GET` must not create a `notification_configs`
   row: a coach without one reads the defaults.
3. **When a player is due — computed by the server, for one coach–player link, on the club-zone
   calendar (R-048; no client re-derives it from dates):**
   - `never` → never due;
   - `monthly` → no record by this coach for this player with `evaluated_on` in the last 30
     days (today inclusive: today and the 29 days before it — a record exactly 30 days ago
     is outside, so that player is due; 29 days ago is inside); a player never evaluated is due;
   - `every_n_classes` → the player was marked present (`presences.status = 'present'`) in N or
     more occurrences of this coach's classes dated after the link's newest `evaluated_on`; a
     player never evaluated is due once present in N. Unmarked and absent presences do not count.
     Every occurrence counts on its own: two weekly classes in one week are two. Only
     occurrences dated today or earlier count — a future class marked `present` in advance
     was not attended.
   Nothing is stored and nothing expires; `due` is derived on read, in **one query per surface,
   never one per row** (pinned by a query-count assertion).
4. **Where the marker shows.** `due` on each participant of the class panel
   (`evaluations.class-panel` rule 8) and on each row of the coach's players list
   (`players.list` rule 9) — a small marker with an accessible label; the list is not re-sorted
   by it. Coach-only. Nowhere else: the player detail header is not in the canvas and gets none
   (build default; the owner may add it later).
5. **In-app only.** No push, no e-mail, no system message, no scheduler job, no new notification
   event; nothing about a reminder ever reaches a player.
6. **The setting does not ship before the marker.** A stored frequency that nothing reads is the
   canvas's own dead chrome (AV-090). One ticket, both halves, web and iOS.
7. **Existing coaches get "Nunca"** — the column default, no backfill; a coach without a
   `notification_configs` row reads `never` too. Nothing changes for a coach who never
   touches the setting: no marker anywhere, which is today's behaviour (Coordinator's binding
   2026-09-22: no coach wakes up to a wall of "due" badges). "Mensalmente" is the first real
   option the control offers, not the stored default — the canvas's "(default)" is a suggestion.
8. **The endpoint parses JSON directly and distinguishes absent / null / falsy.** It must not
   read or write through the shared form layer (`tools/input_tools.py` `Field.set_value`,
   `JsonRequestAdapter`, `model.update_with_dict`). An absent `everyN` on a `PUT` that keeps
   `every_n_classes` changes nothing; `everyN: 0` is a 400, not "not sent".
9. **The frozen legacy endpoints are untouched** (R-047): nothing here changes what
   `GET /evaluation_categories`, `POST /add_evaluation_entry`, `GET /player_profile/<id>`,
   `POST /add_evaluation_categories` or `POST /delete/evaluation_category` list, return, accept
   or delete; PAD-362's pins stay byte-identical. Old App Store builds never call the two new
   paths; the players-list row gains one boolean they ignore.

### Touches
- `notifications.config` — owns `notification_configs`; gains the two columns (its rule 13).
- `players.list` — each row gains the `due` flag and its marker (its rule 9).
- `settings.role-scope` — the coach-only settings list gains "Frequência de avaliações".
- `evaluations.class-panel` — rule 8's `due` becomes real.

### Acceptance Criteria

#### A monthly coach sees a marker after 30 days (rule 3)
- **Given** coach Ana on `monthly`, today 2026-09-21; Rui's newest record is 2026-08-20, Sara's
  2026-08-23, and Tiago has none
- **When** she reads a class panel listing all three
- **Then** `due` is true for Rui and Tiago and false for Sara
- **And** the coach players list read answers the same three values

#### "A cada N aulas" counts attendance since the last record (rule 3)
- **Given** Ana on `every_n_classes` with `everyN` 2; Rui's newest record is 2026-09-01 and he
  was marked present on 2026-09-08 and 2026-09-15; Sara's newest record is 2026-09-01 and she
  was present on 2026-09-08 and absent on 2026-09-15
- **Then** Rui is due and Sara is not, on the class panel and on the players list

#### "Nunca" marks nobody (rule 3)
- **Given** Ana on `never` and a player never evaluated
- **Then** `due` is false on the class panel and on the players list

#### A coach who never set anything sees today's behaviour (rules 3, 7)
- **Given** coach Bruno with no `notification_configs` row and a roster of Rui (record 32 days
  ago), Sara (record 29 days ago) and Tiago (no record)
- **When** he reads the class panel and the players list
- **Then** `due` is false for all three — the `never` answer, no marker anywhere — and no
  `notification_configs` row was created by either read

#### One query per surface (rule 3)
- **Given** Ana's roster of 25 players
- **When** the players list read and the class panel read each run
- **Then** the number of SQL statements each issues does not grow with the roster size

#### The setting round-trips without creating a config row (rules 2, 8)
- **Given** coach Bruno with no `notification_configs` row
- **When** he calls `GET /api/app/evaluation_settings`
- **Then** it answers `{"reminder": "never"}` and no row was created
- **When** he sends `PUT` `{"reminder": "every_n_classes", "everyN": 3}`, then `PUT`
  `{"reminder": "every_n_classes"}`, then `PUT` `{"reminder": "every_n_classes", "everyN": 0}`
- **Then** the first two answer `{"reminder": "every_n_classes", "everyN": 3}` and the third
  answers 400 leaving 3 stored

#### The reminder never leaves the app (rule 5)
- **Given** any frequency and any due player
- **Then** no `Message`, push, e-mail or scheduler job is created by this leaf

#### A student cannot read or write the setting (rules 1, 4)
- **Given** a student's JWT
- **When** it calls `GET` or `PUT /api/app/evaluation_settings`
- **Then** 403; and the student's Settings show no "Frequência de avaliações" entry (asserted by
  test id, `settings.role-scope`)

#### The marker reaches both shells (rule 4)
- **Given** the seeded due player and coach `e2e-coach` on `every_n_classes` N=2
- **When** the coach opens the class panel and the players list on web (Playwright
  `evaluation-reminder.spec.ts`) and on iOS (Maestro flow 97, unconfirmed until run)
- **Then** the marker is present on the due player and absent on the others; setting "Nunca"
  clears it

### Notes
- Build defaults taken with Q4 (not the owner's words; may be revisited): "N aulas" counts
  occurrences the player attended (`present`), not enrolled; every occurrence counts, so two
  weekly classes in one week are two; no marker on the player detail header.
- The App Store trees' players-list decoders were read for strictness before the row gained
  `due` — finding recorded on PAD-404.
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
- Runs (2026-09-22, branch feature/pad-404, migration parent 6a6ac64d814b placed untracked):
  `test_pad404_evaluation_reminder.py` 22/22 on SQLite and Postgres (the query-count test red
  with the class panel's bulk load removed, 21 → 65 statements); `test_pad404_migration_postgres.py`
  1/1; callers pad364 18, pad362 30 (both backends), pad274 17, pad254 10, test_player_* 55,
  pad397 17; web + mobile tsc clean; the setting's unit test 9/9; rendered-text ratchet 119/119;
  packages 603/603; Playwright `evaluation-reminder.spec.ts` 2/2 and `student-settings-scope.spec.ts`
  23/23 on an isolated stack. Maestro 97 (iOS) passed on Session-D's iPhone 17 Pro simulator at
  `5b41137e7` (2026-09-23 23:25:27Z, 60 steps), after two flow fixes (`back` is a no-op on iOS, so
  it opens Players by link; the search is cleared before typing). **Not yet run:** the full backend
  suite. The status stays `implementing` until it has run and PAD-402's parent revision is on
  staging.
