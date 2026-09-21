---
id: evaluations.reminders
status: draft
depends_on: [evaluations.records, evaluations.class-panel, notifications.config, attendance.presence]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
---

# evaluations.reminders

> **The whole of this leaf is owner-pending (Q4).** The canvas stores a frequency and never uses
> it; what the reminder *is* is the owner's call. Every rule below is the recommended default;
> nothing is built before the owner answers.

### Intent
A coach says how often they want to be nudged to evaluate, and the app marks the players who are
due. It is a marker inside the app, never a message to anyone.

### Entities
- **WRITES:** NotificationConfig (`notification_configs`, one row per coach — where per-coach
  typed settings live), its own migration slot:

  | column | type | meaning |
  |---|---|---|
  | `evaluation_reminder_type` | varchar(16) NOT NULL DEFAULT `'monthly'` | `never` \| `monthly` \| `every_n_classes` |
  | `evaluation_reminder_value` | int NULL | N, used by `every_n_classes` only |
- **READS:** EvaluationRecord, Presence, LessonInstance, Association_CoachPlayer.

### Rules
1. **(AV-050) The setting "Frequência de avaliações"**, in the coach's Settings: "Nunca",
   "Mensalmente" (default), "A cada 2 aulas", "A cada 4 aulas", "Personalizado" → a number field
   with the suffix "aulas", hint "A cada quantas aulas queres ser lembrado", default 4. Caption:
   "O lembrete só ajuda a manter o histórico atualizado — a avaliação continua opcional."
   "A cada 2/4 aulas" and "Personalizado" are all `every_n_classes` with `everyN` 2, 4 or the
   typed number. **(pending owner decision Q4)**
2. **The endpoint.** `GET /api/app/evaluation_settings` and `PUT /api/app/evaluation_settings`
   (JWT, coach) with `{reminder: 'never' | 'monthly' | 'every_n_classes', everyN?}` → the same
   shape. `everyN` is an integer 1–99, required with `every_n_classes` (else 400) and ignored
   otherwise; an unknown `reminder` → 400. The `GET` must not create a `notification_configs`
   row: a coach without one reads the defaults.
3. **When a player is due — computed by the server, for one coach–player link, on the club-zone
   calendar:**
   - `never` → never due;
   - `monthly` → no record by this coach for this player with `evaluated_on` in the last 30
     days (today inclusive); a player never evaluated is due;
   - `every_n_classes` → the player was marked present (`presences.status = 'present'`) in N or
     more occurrences of this coach's classes dated after the link's newest `evaluated_on`; a
     player never evaluated is due once present in N. Unmarked and absent presences do not count.
   Nothing is stored and nothing expires; `due` is derived on read, in one query per surface,
   never one per row. **(pending owner decision Q4)**
4. **Where the marker shows.** `due` on each participant of the class panel
   (`evaluations.class-panel` rule 8) and on each row of the coach's players list. Coach-only.
   **(pending owner decision Q4)**
5. **In-app only.** No push, no e-mail, no system message, no scheduler job, no new notification
   event; nothing about a reminder ever reaches a player. **(pending owner decision Q4)**
6. **The setting does not ship before the marker.** A stored frequency that nothing reads is the
   canvas's own dead chrome (AV-090). One ticket, both halves, web and iOS.
7. **Existing coaches get "Mensalmente"**, which with an in-app marker sends nothing.
8. **The endpoint parses JSON directly and distinguishes absent / null / falsy.** It must not
   read or write through the shared form layer (`tools/input_tools.py` `Field.set_value`,
   `JsonRequestAdapter`, `model.update_with_dict`). An absent `everyN` on a `PUT` that keeps
   `every_n_classes` changes nothing; `everyN: 0` is a 400, not "not sent".

### Touches
- `notifications.config` — owns `notification_configs`; gains the two columns.
- `players.list` — each row gains the `due` flag and its marker.
- `settings.role-scope` — the coach-only settings list gains "Frequência de avaliações".

### Acceptance Criteria

#### A monthly coach sees a marker after 30 days (rule 3)
- **Given** coach Ana on `monthly`, today 2026-09-21; Rui's newest record is 2026-08-20, Sara's
  2026-08-23, and Tiago has none
- **When** she reads a class panel listing all three
- **Then** `due` is true for Rui and Tiago and false for Sara

#### "A cada N aulas" counts attendance since the last record (rule 3)
- **Given** Ana on `every_n_classes` with `everyN` 2; Rui's newest record is 2026-09-01 and he
  was marked present on 2026-09-08 and 2026-09-15; Sara's newest record is 2026-09-01 and she
  was present on 2026-09-08 and absent on 2026-09-15
- **Then** Rui is due and Sara is not

#### "Nunca" marks nobody (rule 3)
- **Given** Ana on `never` and a player never evaluated
- **Then** `due` is false on the class panel and on the players list

#### The setting round-trips without creating a config row (rules 2, 8)
- **Given** coach Bruno with no `notification_configs` row
- **When** he calls `GET /api/app/evaluation_settings`
- **Then** it answers `{"reminder": "monthly"}` and no row was created
- **When** he sends `PUT` `{"reminder": "every_n_classes", "everyN": 3}`, then `PUT`
  `{"reminder": "every_n_classes"}`, then `PUT` `{"reminder": "every_n_classes", "everyN": 0}`
- **Then** the first two answer `{"reminder": "every_n_classes", "everyN": 3}` and the third
  answers 400 leaving 3 stored

#### The reminder never leaves the app (rule 5)
- **Given** any frequency and any due player
- **Then** no `Message`, push, e-mail or scheduler job is created by this leaf

### Notes
- OPEN (with Q4): whether "N aulas" should count occurrences the player was enrolled in rather
  than attended, and whether two weekly classes should count separately.
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
