---
id: evaluations.history
status: draft
depends_on: [evaluations.records, evaluations.competencies, evaluations.player-view, players.notes]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.history

### Intent
The coach's evaluations of one player, in one place: a line on the profile saying when the last
one was, and a drawer (a page on a phone) with "Nova avaliação", every past evaluation newest
first, and delete. It is the first surface that serves the history the database has kept since
the feature shipped; today only the latest score per category is ever read. It replaces the
shipped evaluation form (`AddEvaluationSheet` on web, `add-evaluation-form` on iOS).

### Entities
- **READS:** EvaluationRecord, EvaluationEntry, EvaluationCategory, LessonInstance (class name),
  Association_CoachPlayer.
- **WRITES:** nothing of its own — the form writes through `PUT /evaluation_record` with
  `classRef: null`, delete through `DELETE /evaluation_record/<id>` (`evaluations.records`
  rules 8, 11).

### Rules
1. **The read.** `GET /api/app/player/<playerId>/evaluations` (JWT, coach) →
   `{lastEvaluatedOn, records: [Record], competenciesWithData: [id]}`. `records` is every record
   of this coach–player link, newest first (`evaluatedOn` descending, then `id` descending),
   each a `Record` (`evaluations.records` rule 8) whose `ratings` include switched-off
   competencies. `lastEvaluatedOn` is the newest `evaluatedOn` (`YYYY-MM-DD`) or null.
   `competenciesWithData` is the id of every competency with at least one entry **in a record**
   of this link, in `evaluations.competencies` rule 5's order. **(build default Q29)** A
   record-less entry (a same-day score a later one superseded, `evaluations.records` rule 13) is
   listed on no card and counted nowhere in the new API. A player not on
   the coach's roster → 404; a caller with no coach profile → 403. Each coach sees only their own
   (build default Q20).
2. **(AV-030) The profile card "Avaliação"** reads "Última avaliação em {d Mmm aaaa}." from
   `lastEvaluatedOn`, formatted in the active locale, or "Ainda não há avaliações." when null.
   The per-category list of latest scores that the card shows today
   (`evaluations.player-view` rules 2–3) leaves the profile; the latest values are read from the
   newest history card. **(pending owner decision Q7)**
3. **(AV-031, build default Q23) "Avaliações" is a primary action on the player profile** and
   opens "Avaliações — {nome}" with two sections, "Evolução" (`evaluations.evolution`) and
   "Histórico". Web: a 520 px drawer, a full page at phone width. iOS: a pushed screen, not a
   native `Modal` sheet. Coach-only. Web and iOS ship in the same ticket.
4. **(AV-032) "Nova avaliação"** is a secondary action, hidden while the form is open. The form
   lists competencies, then "Nota privada (opcional)", then "Concluir avaliação", which only
   closes it; it also has an explicit close control. It writes today's **class-less** record;
   if that record already exists the form opens on it, pre-filled. Tapping nothing creates
   nothing. Stars for a 1–5 competency, a number with a stepper for a legacy scale; tapping the
   lit star clears it (`evaluations.records` rule 10).
5. **(build default Q26, AV-071) What the form lists.** The coach's active competencies plus any
   switched-off competency already rated in today's class-less record. When that list is empty
   the form is an empty state with a way into "Gerir competências"
   (`evaluations.competencies` rule 11) — never a note-only form.
6. **(AV-037, AV-023) A history card** shows the date and "· {aula}" only when the record has a
   class; then one line per rated competency with a read-only control on that competency's own
   scale, switched-off competencies included and not decorated; then the note, in italics and
   quotes, when there is one. The share control and the "shared" line on a card belong to
   `evaluations.sharing` and are absent until it ships. Empty list: "Ainda sem avaliações.", with
   "Nova avaliação" still offered.
7. **(build default Q27, AV-073) One card per record.** A class record and a class-less record of
   the same day are two cards, the class one carrying its class name.
8. **(build default Q9) Today's card is editable, every card can be deleted.** A card with
   `editable: true` offers "edit", which opens the form on that record (for a class record the
   form carries that record's `classRef`). Every card offers "delete": a confirmation naming the
   date, then `DELETE /evaluation_record/<id>`; the list and `lastEvaluatedOn` refresh. The canvas
   has neither action.
9. **(build default Q21) Strengths and weaknesses leave the web evaluation form only once
   another web editor is proven to exist.** Today `AddEvaluationSheet` is the only known place a
   coach edits them on web (iOS uses a separate profile card, `players.notes`). The slice that
   replaces the sheet must first name where a coach edits them on web outside it and prove that
   path works; if there is none, it either adds the profile-card editor on web in the same
   ticket or keeps a strengths/weaknesses section in the new web form, saved through the
   existing `POST /add_evaluation_entry` call with an empty `scores` array. They are never
   dropped. `PUT /evaluation_record` does not carry them.
10. **(AV-077) The drawer owns its state.** Closing it closes the form and resets the evolution
    selection; opening it for another player never shows the previous player's form or
    selection. It is not rendered outside the player view.

### Touches
- `evaluations.player-view` — the shipped card it describes is replaced by rule 2 when this leaf
  is built; that leaf is then rewritten or deprecated by the building slice.
- `players.profile` — the profile screen gains the "Avaliações" action; `GET /player_profile`
  keeps its shape (`evaluations.legacy-client-contract` rule 4) and new clients read it for
  strengths and weaknesses only.
- `players.notes` — rule 9's outcome (where strengths/weaknesses are edited on web) is recorded
  there by the building slice.
- E2E and Maestro: the old form's test ids go away — grep `e2e/` and `.maestro/`
  (`57-evaluation-untouched-categories.yaml`, `evaluation-untouched-categories.spec.ts`,
  `evaluation-persist.spec.ts`, `player-notes.spec.ts`).

### Acceptance Criteria

#### The read lists records newest first with their class (rules 1, 7)
- **Given** coach Ana's player João Silva (id 9) with a class-less record on 2026-06-18
  (Bandeja 4, Posição atacante 3) and, on 2026-09-21, a record in "Aula 5" (instance 88; Bandeja
  4, note "Continua a trabalhar a tomada de decisão no ataque.") and a class-less one (Técnica 3)
- **When** she calls `GET /api/app/player/9/evaluations` on 2026-09-21
- **Then** `lastEvaluatedOn` is `"2026-09-21"` and `records` has three items: the two of
  2026-09-21 first (higher id first), both `editable: true`, one with `className: "Aula 5"` and
  `classInstanceId` 88 and one with both null; then 2026-06-18 with `editable: false`
- **And** `competenciesWithData` holds the ids of Técnica, Bandeja and Posição atacante

#### The profile card names the last evaluation (rule 2)
- **Given** João as above, and Sara with no evaluation
- **When** Ana opens each profile on web and on iOS
- **Then** João's card (`data-testid` `evaluation-card-last`) shows the 2026-09-21 date in the
  active locale ("Última avaliação em 21 Set 2026." in pt); Sara's shows the empty line
  ("Ainda não há avaliações."); both profiles offer the "Avaliações" action

#### A switched-off competency stays on its card (rule 6)
- **Given** the 2026-06-18 record holds Bandeja 4 and Bandeja has since been switched off
- **When** the history renders
- **Then** that card still shows Bandeja at 4 of 5, and the "Nova avaliação" form has no Bandeja row

#### "Nova avaliação" opens on today's class-less record (rules 4, 5)
- **Given** today's class-less record for João holds Técnica 3
- **When** Ana opens "Nova avaliação"
- **Then** the form shows Técnica pre-filled with 3 and the "Nova avaliação" action is hidden
- **When** she closes the form without touching anything
- **Then** no request was sent and the record is unchanged

#### Another coach's player is not served (rule 1)
- **Given** coach Bruno, who does not have João on his roster
- **When** he calls `GET /api/app/player/9/evaluations`
- **Then** the response is 404 and no record data is returned
- **And** student João calling it gets 403

#### Deleting a past record (rule 8)
- **Given** the 2026-06-18 record
- **When** Ana confirms its delete
- **Then** `DELETE /evaluation_record/<id>` answers `{"status": "ok"}`, the card is gone, and the
  entries it held no longer count in evolution

#### Strengths and weaknesses survive the new form (rule 9)
- **Given** João has two strengths and one weakness recorded by Ana
- **When** the slice that replaces `AddEvaluationSheet` ships
- **Then** Ana can add and delete a strength for João on web and on iOS, and all three notes are
  still shown on both

### Notes
- The read is unpaged in the plan's contract. OPEN: add a cursor if production counts show
  links with hundreds of records.
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
