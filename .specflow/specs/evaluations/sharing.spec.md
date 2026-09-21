---
id: evaluations.sharing
status: draft
depends_on: [evaluations.records, evaluations.history, evaluations.evolution, messaging.messages]
implements: ../../specs-business/evaluations/coach-shares-an-evaluation.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.sharing

> **The whole of this leaf is owner-pending.** Today a player sees no evaluation at all, so
> sharing is a *new disclosure*, not a change to an existing one. It waits for owner questions
> Q2, Q3, Q5 and Q6; every rule below is the recommended default and is tagged where an answer
> would change it. Nothing here is built before the owner answers.

### Intent
A coach decides, per evaluation, what a player may see of it — which competencies, how much of
the trend, whether the note travels — previews exactly that, and shares it. Everything else
stays private.

### Entities
- **CREATES:** EvaluationShare (`evaluation_shares`, its own migration slot)

  | column | type | meaning |
  |---|---|---|
  | `id` | int PK | |
  | `record_id` | FK → `evaluation_records` CASCADE, NOT NULL, UNIQUE | one share per record |
  | `shared_at` | datetime NOT NULL | an instant, naive UTC — never a display string (AV-076) |
  | `category_ids` | JSON NOT NULL | the chosen competencies |
  | `evolution` | varchar(8) NOT NULL | `last` \| `6m` \| `1y` \| `none` |
  | `include_note` | boolean NOT NULL | |
  | `card` | JSON NOT NULL | the snapshot the player is served (rule 7) |
  | `created_at`, `updated_at` | datetime NOT NULL | |
- **READS:** EvaluationRecord, EvaluationEntry, EvaluationCategory. **WRITES:** Message (rule 8).

### Rules
1. **(AV-040) Private until shared.** A record has no share when created, and nothing about an
   unshared record reaches a player's device — no payload key, no count, no push.
   **(pending owner decision Q2)**
2. **(AV-041) Step 1 — choose what to show.** From a history card's "Partilhar avaliação":
   title "Escolhe o que queres mostrar a {primeiro nome}"; a checkbox per competency **rated in
   this record** ("Bandeja — 4/5"), all pre-selected; evolution pills "Desde a última avaliação"
   (`last`, default), "Últimos 6 meses" (`6m`), "Último ano" (`1y`), "Não mostrar evolução"
   (`none`); and, only when the record has a note, "Incluir comentário do treinador", **off by
   default**. Button "Pré-visualizar".
3. **(AV-042) Step 2 — the preview is what the player gets.** `POST
   /api/app/evaluation_record/<id>/share_preview` with `{categoryIds, evolution, includeNote}` →
   the `Card`. The same server function builds the preview and the share, and one card component
   renders the coach's preview and the player's card. "Voltar" returns to step 1 with the
   selection intact; "Partilhar" commits.
   `Card = {recordId, coachName, evaluatedOn, className|null, sharedAt|null, ratings: [{name,
   key|null, score, scaleMin, scaleMax}], evolution: [{name, key|null, delta}], evolutionPeriod,
   note|null}` — names and numbers only; a player is never sent a competency id.
4. **(AV-075) Order is the coach's competency order** (`evaluations.competencies` rule 5), never
   the order of ticking. Re-ticking a competency does not move it.
5. **(build default Q12) One evolution line per chosen competency, over the chosen period.**
   `last`: this record's rating minus the previous rating of that competency for this
   coach–player. `6m` / `1y`: the latest monthly mean minus the first monthly mean inside the
   window (`evaluations.evolution` rules 5, 7). `none`: no lines. A line is left out when there
   is nothing to compare. Rounding, sign and colour follow `evaluations.evolution` rules 8–9.
   (The canvas draws one line, for the first ticked competency, ignoring the period — mock defect.)
6. **(build default Q12) At least one competency.** "Pré-visualizar" and "Partilhar" are disabled
   with every box clear; an empty `categoryIds`, or an id not rated in the record → 400.
7. **(AV-043, build default Q11) Sharing stores a snapshot.** `POST
   /api/app/evaluation_record/<id>/share` with the same body → the `Record`, its `share` now
   `{sharedAt, categoryIds, evolution, includeNote}`. The `card` is frozen: scores, deltas and
   note as they were. A later edit of the record the same day does not change what the player
   sees; the coach's card then offers "Atualizar partilha", which is the same `POST` again — it
   replaces the snapshot, moves `sharedAt` and sends **no** message. Switching a competency off
   later changes no shared card. The history card reads "✓ Partilhada com o aluno em {data}",
   formatted client-side from `sharedAt`.
8. **Sharing sends one system message** in the coach–student thread ("{treinador} partilhou uma
   avaliação contigo"), through the existing system-message path: a `Message` row, the live
   update, web push and mobile push `{"type": "message", "conversationId": …}`. No new push type
   and no new `message_type`, so App Store 1.0/1.1.0 render the sentence and open the thread. One
   message per first share of a record — two records shared on one day are two cards and two
   messages. No separate opt-out in the first version. **(pending owner decision Q3)**
9. **Un-share and delete.** `DELETE /api/app/evaluation_record/<id>/share` ("Deixar de
   partilhar") removes the share; the card leaves the player's list at once and nobody is
   notified. Deleting a shared record asks for confirmation that says the player will stop
   seeing it, and removes the share with it. **(pending owner decision Q6)**
10. **Any record can be shared**, including backfilled ones recorded before sharing existed and
    past (read-only) ones. **(pending owner decision Q5)**
11. **The endpoints parse JSON directly and distinguish absent / null / falsy.** They must not
    read or write through the shared form layer (`tools/input_tools.py` `Field.set_value`,
    `JsonRequestAdapter`, `model.update_with_dict`). `includeNote: false` is honoured as false;
    `evolution: "none"` is a value, not an absence; an absent `includeNote` or `evolution` → 400
    (both are required); `includeNote: true` on a record with no note shares no note.
12. **Authorisation.** All three endpoints: coach-owned record, else 403; unknown record → 404.
13. **(AV-072, build default Q26) Both steps have an explicit cancel/close control** besides the
    scrim, and abandoning either writes nothing.
14. **(build default Q23) Layout.** A two-step modal on desktop web, a sheet at phone width, two
    pushed screens on iOS. Web and iOS ship in the same ticket.

### Touches
- `messaging.messages` / `messaging.push-notifications` — no rule changes; the building slice
  adds a criterion that a share pushes as `type: "message"` and nothing else.
- `notifications.message-templates` — if the share sentence becomes a coach-editable template,
  that leaf gains the key; decided with Q3.
- `evaluations.history` — its card gains the share control and the "shared" line (its rule 6).
- `evaluations.records` — `Record.share` is served from this table; record delete removes it.

### Acceptance Criteria

#### Nothing is shared by default (rule 1)
- **Given** coach Ana records Técnica 4 and the note "Boa sessão" for Rui
- **Then** the record's `share` is null, and `GET /api/app/my_evaluations` as Rui returns
  `{"cards": []}`

#### Step 1 pre-selects competencies, not the note (rule 2)
- **Given** a record holding Técnica 4, Tática 3 and the note "Boa sessão"
- **When** Ana opens its share flow
- **Then** both boxes are ticked, the evolution choice is `last`, and the include-note toggle is
  off (`data-testid` `share-include-note`, unchecked)

#### One line per chosen competency, over the chosen period (rules 3, 5)
- **Given** Técnica was 3 on 2026-09-14 and is 4 in this record; Tática was 3 and is 3;
  Consistência is rated here for the first time
- **When** Ana previews all three with `evolution: "last"`
- **Then** the card's `evolution` is `[{"name": "Técnica", …, "delta": 1.0}, {"name": "Tática",
  …, "delta": 0.0}]` in competency order — Consistência has a rating and no line

#### The João Silva card over six months (rule 5)
- **Given** João's Bandeja history from `evaluations.evolution`'s dataset and today's record
  with Bandeja 4
- **When** Ana previews Bandeja with `evolution: "6m"` on 2026-09-21
- **Then** the Bandeja line's `delta` is 0.5 (September 4.0 minus June 3.5; March is before the
  2026-03-21 cutoff)

#### Sharing nothing is refused (rule 6)
- **When** Ana posts `…/share` with `{"categoryIds": [], "evolution": "none", "includeNote": false}`
- **Then** the response is 400 and the record's `share` is still null

#### Sharing stores an instant and sends one message (rules 7, 8)
- **Given** the record above at 2026-09-21 14:05:11 UTC
- **When** Ana shares Técnica only with `includeNote: false`
- **Then** `evaluation_shares.shared_at` is the datetime 2026-09-21 14:05:11, `category_ids` is
  `[<Técnica>]`, and the stored `card` has one rating and `note: null`
- **And** exactly one `Message` exists in the Ana–Rui thread and one mobile push whose data is
  `{"type": "message", "conversationId": <id>}`; no push of another type was sent

#### An edit after sharing does not change the player's card (rule 7)
- **Given** the shared record, the same day
- **When** Ana changes Técnica from 4 to 5
- **Then** Rui's card still holds Técnica 4, and Ana's card offers "Atualizar partilha"
- **When** she uses it
- **Then** Rui's card holds Técnica 5, `sharedAt` moved, and no second message exists

#### Un-sharing is silent (rule 9)
- **When** Ana sends `DELETE /api/app/evaluation_record/<id>/share`
- **Then** the record's `share` is null, Rui's `cards` no longer holds it, and no message or push
  was created

#### Cancelling writes nothing (rule 13)
- **Given** Ana opens step 1, clears one box and uses the cancel control
- **Then** no request was sent and the record's `share` is unchanged

### Notes
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
