---
id: evaluations.class-panel
status: draft
depends_on: [evaluations.records, evaluations.competencies, classes.detail-visibility, attendance.presence]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
---

# evaluations.class-panel

### Intent
A coach evaluates the players of one class from the class itself: the class detail opens a panel
listing that occurrence's participants, and the coach rates them one after another without
leaving it. Today the only entry point is the player's page.

### Entities
- **READS:** Lesson, LessonInstance, Presence, `player_in_lesson` (the participants);
  EvaluationCategory (the coach's active competencies); EvaluationRecord and EvaluationEntry
  (today's record per participant); Association_CoachPlayer.
- **WRITES:** nothing of its own — every input is a `PUT /evaluation_record`
  (`evaluations.records` rule 8) carrying the panel's `classRef`.

### Rules
1. **(AV-010) "Avaliações" is a primary action on the class detail, for the coach only.** It
   joins the existing footer actions as the primary one and is rendered only in the coach branch
   of the shared class screen, for a coach who owns the class. A student never sees it.
2. **(AV-011, build default Q23) The panel replaces the class detail in the same surface**,
   titled "Avaliações — {aula}". Back ("←") returns to the class detail; close ("×" or the scrim)
   closes the whole surface. Web: the class sheet, a full page at phone width. iOS: a pushed
   screen, not a native `Modal` sheet. Web and iOS ship in the same ticket.
3. **The read.** `POST /api/app/class_instance/evaluations?model=&id=&date=` (JWT, coach; the same
   occurrence addressing as `POST /class_instance`) →
   `{classInstanceId|null, competencies: [active], participants: [{playerId, coachPlayerId,
   name, absent, due, record: Record|null}]}`. It is a **read and materialises nothing**:
   `classInstanceId` is null for an occurrence with no row yet; the first write materialises it
   (`evaluations.records` rule 4). `competencies` items are `{id, key|null, name, group|null,
   scaleMin, scaleMax}` in `evaluations.competencies` rule 5's order. **(build default Q28)**
   `record` is the participant's **most recent record for this occurrence** — the one with the
   greatest `evaluated_on` — (`Record`, `evaluations.records` rule 8), or null; its `editable`
   says whether it is today's. Otherwise a coach opening yesterday's class would read "Sem
   avaliação" for players they rated in it yesterday. An unmaterialised occurrence has no
   record. A coach who does not own the class → 403; a caller with no coach profile → 403 with
   no participant data; an unknown class → 404. It takes no body.
4. **(AV-012, build default Q14) Who is listed.** Everyone enrolled in that dated occurrence —
   its `presences` rows once materialised, the series roster (`player_in_lesson`) before.
   Participants marked absent (`presences.status = absent`) come last and can still be rated;
   the rest keep the class detail's order. A participant with no coach–player link to this coach
   is left out. One row is open at a time; opening another collapses the first. A row shows the
   avatar, the name, the rule 5 summary and an expand control.
5. **(AV-013, AV-070, build default Q26) The row summary never hides a rating.** The row lists
   the coach's active competencies **plus any switched-off competency that already holds a
   rating in the row's record** (rule 3) for this participant and occurrence. `M` is the size of that list
   and `N` the number of them rated in the record: `N > 0` → "`N`/`M` avaliadas"; `N = 0` → "Sem
   avaliação". So the summary cannot read "Sem avaliação" while a rating exists (the canvas does:
   AV-070, mock defect). A record holding only a note counts `N = 0`; its note shows pre-filled
   when the row opens. When the row's record is **not** `editable` (it was made on an earlier
   day) the summary and the expanded ratings come from it, shown read-only with its date; the
   first tap today starts today's record for the same occurrence (`evaluations.records` rule 2),
   which the next read returns.
6. **(AV-014, AV-071) The expanded row** has one line per listed competency (rule 5) — five stars
   for a 1–5 competency, a number with a stepper for a legacy scale (`evaluations.competencies`
   rule 3) — then "Nota privada (opcional)". Each input saves as it is made; tapping the lit star
   clears it (`evaluations.records` rules 7, 10). When the list is **empty** (no active
   competency and none rated today) the expanded row is an empty state with a way into "Gerir
   competências" — never a note-only form.
7. **(AV-015) "Gerir competências" is reachable from the panel twice** — an action beside the
   panel's heading and a "+ Gerir competências" button under the list
   (`evaluations.competencies` rule 11). Returning from it reloads `competencies`.
8. **The due marker.** `due` comes from `evaluations.reminders` rule 3 and is `false` for every
   participant until that leaf ships. **(pending owner decision Q4)**
9. **(AV-077) The panel owns its state.** Closing the surface, or moving to another class or
   view, collapses the open row and unmounts the panel; reopening starts collapsed from a fresh
   read. Nothing typed is lost, because it was already saved (rule 6).

10. **When the action is offered.** For an occurrence dated today or later on the club-zone
    calendar, and for any occurrence that is already materialised (attendance taken, edited…).
    For a **past occurrence that was never materialised** the action is not offered — disabled
    with a one-line explanation — and the coach evaluates from the player instead: a write
    would answer 409 (`evaluations.records` rule 4), because materialising a class that is over
    enrols its roster and fills its waiting list. The building slice may propose something less
    restrictive to the evaluation-system lead; it never materialises a past class as a side
    effect of rating.

### Touches
- `classes.detail-visibility` — gains a rule that the class payload itself carries no evaluation
  data, that the coach branch renders the "Avaliações" action, and that the panel endpoint
  answers 403 to every student; plus a criterion. The class payload (`POST /class_instance`) is
  not changed.
- `classes.instances` — see `evaluations.records` "Touches" (materialise on first write).
- `attendance.presence` — read only; `absent` is `presences.status = 'absent'`, an unmarked
  presence is not absent.

### Acceptance Criteria

#### The panel lists the occurrence's participants, absent last, and creates nothing (rules 3, 4)
- **Given** coach Ana's weekly class (lesson id 7) on 2026-09-21 with no `lesson_instances` row,
  roster Rui, Tiago and Sara, and three active competencies
- **When** she calls `POST /api/app/class_instance/evaluations?model=Lesson&id=7&date=2026-09-21`
- **Then** `classInstanceId` is null, `competencies` has 3 items, `participants` are Rui, Tiago,
  Sara with `absent: false`, `due: false`, `record: null` and each a `coachPlayerId`
- **And** no `lesson_instances` row was created
- **Given** the occurrence is later materialised (id 88) and Rui is marked absent
- **Then** the same read returns `classInstanceId` 88 and the order Tiago, Sara, Rui

#### The summary counts this occurrence's record only (rule 5)
- **Given** active competencies Técnica, Tática, Consistência; Ana rated Rui Técnica 4 in class 88
  today and Tática 3 from his player page today
- **When** the panel is read
- **Then** Rui's `record` holds Técnica 4 only and his row reads "1/3 avaliadas"

#### A rating under a switched-off competency is listed and counted (rule 5, AV-070, Q26)
- **Given** the same three active competencies, and João's record for class 88 today holds
  Bandeja 4, Posição atacante 4 and Tomada de decisão 3 — all three switched off — and the note
  "Continua a trabalhar a tomada de decisão no ataque."
- **When** the panel renders his row
- **Then** it reads "3/6 avaliadas", not "Sem avaliação"; expanded, it lists six competencies,
  three of them rated, and the note pre-filled
- **And** tomorrow's panel for João lists the three active competencies only

#### Yesterday's class still shows what was rated in it (rules 3, 5, Q28)
- **Given** class 88 took place on 2026-09-20 and Ana rated Rui Técnica 4 in it that day; today
  is 2026-09-21
- **When** she opens the panel of class 88
- **Then** Rui's `record` is the 2026-09-20 one with `editable: false`, his row reads "1/3
  avaliadas", and expanded it shows Técnica 4 read-only with that date
- **When** she taps Tática 3 for Rui
- **Then** a second record exists for Rui and class 88 with `evaluated_on` 2026-09-21 holding
  Tática 3, and the next read returns it as his `record`

#### A past class that was never opened offers no panel (rule 10)
- **Given** the 2026-09-14 occurrence of weekly class 7 has no `lesson_instances` row and today
  is 2026-09-21
- **When** Ana opens that occurrence's class detail on web and on iOS
- **Then** the "Avaliações" action is disabled with its explanation (`data-testid`
  `class-eval-unavailable`), and no instance, presence or waiting-list entry was created

#### No competency to list shows the way to the editor (rule 6, AV-071)
- **Given** Ana has switched every competency off and Tiago has no record today
- **When** she expands Tiago's row
- **Then** it shows the empty state with the "Gerir competências" action and no note field
  (`data-testid` `class-eval-empty`), and his summary reads "Sem avaliação"

#### A student cannot reach the panel (rules 1, 3)
- **Given** student Rui, enrolled in class 88
- **When** he opens the class detail on web and on iOS, and calls the panel endpoint directly
- **Then** no "Avaliações" action is rendered, and the call answers 403 with no participant name
  in the body

#### Closing does not lose or leak state (rule 9)
- **Given** Ana has Rui's row open in class 88 and has typed the note "Boa sessão"
- **When** she closes the surface and opens the panel of class 89
- **Then** every row is collapsed and no note text is shown; Rui's record for class 88 holds
  "Boa sessão"

### Notes
- Criteria name Portuguese copy for the reader; tests locate by test id and `ui()`, never by
  rendered copy (the app ships en + pt).
- OPEN: whether `participants[]` needs anything beyond `coachPlayerId` from `serialize_player`
  is unverified (current-state map, "Not checked").
