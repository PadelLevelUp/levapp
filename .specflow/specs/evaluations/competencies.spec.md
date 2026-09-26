---
id: evaluations.competencies
status: implementing
depends_on: [evaluations.categories, evaluations.legacy-client-contract]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.competencies

### Intent
What a coach scores players on: a built-in catalogue they switch on and off, their own custom
competencies, and the categories they already had. One set per coach (AV-026), used by every
evaluation surface, managed in "Definir categorias de avaliação" (PAD-431; "Gerir competências"
before). Since PAD-431 the set is a **two-level tree**: categories, some holding sub-categories
(rule 15). The UI says **category / sub-category**; the new endpoints and the code say
**competency**; the table, the foreign key and the wire key `categoryId` stay **category**.

### Entities
- **WRITES:** EvaluationCategory (`evaluation_categories`) — existing columns unchanged (`id`,
  `coach_id` FK CASCADE, `name` varchar(100) NOT NULL, `scale_min` int default 1, `scale_max` int
  default 10, `created_at`, `updated_at`; unique `(coach_id, name)`, PAD-273), plus:

  | column | type | meaning |
  |---|---|---|
  | `catalogue_key` | varchar(64) NULL | the catalogue entry this row was switched on from; NULL for custom and legacy |
  | `competency_group` | varchar(16) NULL | `general` \| `technique` \| `tactics` \| `custom`; **NULL = legacy** — what `evaluations.legacy-client-contract` filters on |
  | `is_active` | boolean NOT NULL DEFAULT true | offered on entry forms |
  | `sort_order` | int NULL | position inside its group; NULL sorts last, then by `name` |
  | `parent_id` | int NULL, FK `evaluation_categories.id` ON DELETE CASCADE | **(PAD-431)** the category a sub-category belongs to; NULL for a category (rule 15) |

  Unique `(coach_id, catalogue_key)` where `catalogue_key` is not null. The migration (one, with
  `evaluations.records`'s table; idempotent, every DDL guarded) backfills nothing: every existing row is
  legacy and active by the column defaults, and no `scale_min`/`scale_max` is touched.
- **WRITES:** DeletionAudit (rule 9). **READS:** EvaluationEntry (counts).

### Rules
1. **(AV-020, build default Q16) The catalogue is 17 entries in three groups, in code, not in the
   database.** Each has a stable key; its label comes from client i18n (en + pt) by key.
   - `general`: `technique` (Técnica), `tactics` (Tática), `consistency` (Consistência)
   - `technique`: `forehand` (Direita), `backhand` (Esquerda), `volley` (Volley), `bandeja`
     (Bandeja), `vibora` (Víbora), `smash` (Smash), `glass_exit` (Saída de vidro), `double_glass`
     (Duplo vidro), `serve` (Serviço)
   - `tactics`: `defensive_position` (Posição defensiva), `attacking_position` (Posição atacante),
     `transition` (Transição), `decision_making` (Tomada de decisão), `doubles_play` (Jogo em dupla)

   **(PAD-431, reverses "never compared")** The catalogue is the coach's default tree: the three
   `general` entries are **categories**, and each entry of the `technique` / `tactics` group is a
   **sub-category** whose default parent is the category keyed by the same word (`technique` →
   the `technique` row, `tactics` → the `tactics` row). `consistency` has no default
   sub-categories. That word is the only link between a group and a key. A catalogue competency is a **row created only when a coach
   switches it on** (`POST`, rule 6); an unused entry is no row at all and exists for no client.
   The row's `name` holds the Portuguese label, so the per-coach name uniqueness covers it.
2. **Three kinds of row.** *Legacy* (`competency_group` NULL): every category that existed before
   this leaf, and every one created by a legacy endpoint or the import. *Catalogue*
   (`catalogue_key` set, group `general`/`technique`/`tactics`). *Custom* (group `custom`, no key).
3. **(AV-003) Scale.** Catalogue and custom competencies are created on **the coach's scale**
   (`evaluations.scale` rules 1–2; 1–5 unless the coach chose another) and rated with five whole
   stars on 1–5 or a slider on 1–10/20/100 (`evaluations.scale` rule 7; PAD-423 partly reverses
   PAD-403 here). A legacy category keeps its own `scale_min`/`scale_max` and every score it holds,
   is rendered as a number with a stepper ("7/10"), never as stars, and charts on its own scale.
   No row is rescaled by any migration. **(pending owner decision Q1)**
4. **(AV-021, build default Q17; PAD-431 D3) What a coach starts with.** A coach who holds any
   category keeps them all, active, and gets no new catalogue row — nothing is switched on for
   them; the defaults they lack are offered as "add" (rule 15). A coach who holds **no row at
   all** gets **the whole default tree** created active — the three `general` categories and, under
   Técnica and Tática, their 14 sub-categories (17 rows) — the first time a new endpoint reads
   their set (get-or-create, idempotent; never by a legacy endpoint, never by
   the migration). Consequence for rollback: for such a coach this read — a GET — is the
   first thing that creates a non-legacy row, so the "old code is safe on the new schema until the
   first non-legacy row exists" boundary (PAD-363) is crossed by the first new-client read, not
   only by `POST /evaluation_competency`. A catalogue entry whose en or pt label equals, case-insensitively, the name of
   a row the coach already holds is **hidden for that coach**: it is left out of `catalogue[]`
   and `POST {catalogueKey}` for it answers 409.
5. **Reading.** `GET /api/app/evaluation_competencies` (JWT, coach) →
   `{competencies: [{id, key|null, name, group|null, scaleMin, scaleMax, isActive, sortOrder,
   scoreCount}], catalogue: [{key, group}]}`. `competencies` is every row the coach holds, active
   or not, legacy included (`group: null`), ordered `general`, `technique`, `tactics`, then
   custom and legacy together, each by `sortOrder` then `name`. `catalogue` is the built-in
   entries the coach has not switched on (minus rule 4's hidden twins). `scoreCount` is the
   number of `evaluation_entries` rows on it. Shells show the groups as "Geral", "Técnica",
   "Tática", "Personalizada"; an empty group is hidden (AV-022). **(Q31, ruled 2026-09-21)** The
   manager does NOT put legacy rows under "Personalizada": they are a section of their own,
   "As tuas categorias", FIRST, each with its scale written out ("1–10") — an existing coach
   opens onto their own things, switched on, and scrolls down to discover the catalogue; a coach
   with no legacy row sees exactly the canvas's order. This is client-side sectioning of the
   same response (`packages/config/src/competency-manager.ts`, shared by both shells); the
   API's order is unchanged. The order is static — nothing moves when it is switched, including
   the FIRST time, when a catalogue entry that was not a row becomes one: "Geral", "Técnica"
   and "Tática" list rule 1's fixed catalogue order, rows and not-yet-rows interleaved (the
   shells hold that order as `CATALOGUE_ORDER`, tied to the server's list by a test; a key a
   client does not know sorts last). Only "As tuas categorias" and "Personalizada", which
   hold rows only, are ordered by `sortOrder` then `name`.
6. **(AV-024) Creating.** `POST /api/app/evaluation_competency` with `{catalogueKey}` or `{name}`
   → the competency, 1–5 and active. `{catalogueKey}` for an unknown key → 400; for one already a
   row → that row is **set active if it was off** and returned (switching on is idempotent). `{name}` is
   trimmed; empty after trimming → 400; longer than 100 → 400; a name the coach already holds on
   any row, compared case-insensitively → **409** (PAD-273; the canvas has no duplicate check —
   mock defect). Accented characters are kept as typed; nothing is keyed on a slug (AV-078).
   **(Q36, ruled 2026-09-21 — a known limit, left as it is.)** The case-insensitive refusal is
   a read-then-write check in the service; the database's unique index
   (`uq_evaluation_categories_coach_name`) is on `(coach_id, name)` as typed, so it is
   case-SENSITIVE. Two names that differ only in case are refused one after the other, but two
   such requests that RACE can both be created. A case-insensitive index was ruled out: it
   needs a migration slot and could fail to build on rows that are legal today (a legacy
   "Serve" beside "serve", created through the name-keyed legacy upsert). The same holds for a
   rename (rule 8).
7. **(AV-022, AV-023, AV-025) Switching on and off.** `PATCH /api/app/evaluation_competency/<id>`
   with `{isActive}`. Off removes the competency from the next entry form that opens and changes
   nothing else: its ratings stay in their records, show on every history card that holds them,
   and keep their evolution pill. No record, card or shared snapshot is rewritten. The editor
   says so: "As alterações aplicam-se imediatamente às próximas avaliações."
8. **(build default Q18; PAD-431 D4, reverses "a catalogue competency cannot be renamed")
   Renaming is by id.** `PATCH … {name}` updates the row in place and keeps every rating, which
   resolves **B-125** for new clients (the legacy upsert keeps forking, as pinned). Same validation
   as rule 6. **Any** row can be renamed, a catalogue one included: renaming a catalogue row makes
   it the coach's own — `catalogue_key` is cleared and `competency_group` becomes `custom` (never
   NULL: it must not turn legacy, R-047) — and it keeps its id, its ratings, its `parent_id` and
   its sub-categories. Its entry reappears in `catalogue` and can be added again (rule 6), as a
   separate row. `sortOrder` is an integer ≥ 0, or `null` to un-order the competency (it then sorts last in its group, by name); `null` is a value here, not an absence (rule 10).
9. **(build default Q18) Deleting.** `GET /api/app/evaluation_competency/<id>/impact` →
   `{name, scores, players}`; `DELETE /api/app/evaluation_competency/<id>` deletes **any**
   competency — catalogue, custom or legacy (PAD-431 D4 reverses "a catalogue competency can only
   be switched off") — and every score on it, with today's safeguards: the client asks for the
   typed name, and one `deletion_audit` row is written in the same transaction (PAD-274).
   **Deleting a category deletes its sub-categories and every score on them too**; the impact
   counts them (`scores` and `players` over the category and all its sub-categories) and the
   audit row lists the sub-categories deleted. A deleted catalogue entry reappears in
   `catalogue` and can be added again, with no ratings. These are new paths because the legacy
   delete must refuse what old builds cannot see (`evaluations.legacy-client-contract` rule 6).
   Another coach's id → 403 on all three verbs.
10. **The endpoints parse JSON directly and distinguish absent / null / falsy.** They must not
    read or write through the shared form layer (`tools/input_tools.py` `Field.set_value`,
    `JsonRequestAdapter`, `model.update_with_dict`), which reads a falsy value as "not sent"
    (B-136). `isActive: false` switches off; `sortOrder: 0` is stored as 0; an absent key changes
    nothing; a body that is not a JSON object → 400.
11. **(AV-015, build default Q19; renamed by PAD-431) Where the editor lives.** One screen,
    **"Definir categorias de avaliação"** (every "Gerir competências" label is renamed),
    reached from the class panel (twice: the eyebrow action and the "+ Gerir competências"
    button), from the player's evaluations drawer, and from Settings → Preferences, where it
    replaces today's category editor. Coach-only. Every entry goes through one function
    (`openCompetencyManager`): on web it adds `?competencies=open` to the page the coach is on
    and a host in the authenticated layout shows the manager OVER that page — closing removes
    the flag and nothing else, replacing the history entry; on iOS it pushes `/competencies`.
    The manager calls only the endpoints of rules 5–9, never a legacy one
    (`evaluations.legacy-client-contract`). A row is disabled while its own request is in
    flight, and a failed change rolls back visibly with the reason on the row (a duplicate
    name: on the name field, what was typed kept).
12. **(AV-072) No dirty state, explicit close.** Every toggle, rename and
    creation applies when made and each is individually reversible, so there is nothing to
    discard; the editor has an explicit close control ("Concluído") besides the scrim. Delete
    keeps its own confirmation (rule 9). "Applies when made" includes every evaluation surface
    already open under the manager (PAD-422): the player's form and the class panel's rows,
    which read the class's own competency list, show the change without a reload.
13. **(AV-071) A coach may switch everything off.** There is no minimum; the entry surfaces
    handle the empty set (`evaluations.class-panel` rule 6, `evaluations.history` rule 5).
14. **(build default Q23) Layout.** A modal on desktop web, a sheet at phone width, a pushed
    screen on iOS (not a native `Modal` sheet). Web and iOS ship in the same ticket.
15. **(PAD-431) Categories and sub-categories.** A row with `parent_id` NULL is a **category**; a
    row with a `parent_id` is a **sub-category** of that category.
    - **Two levels, never more.** A parent must be one of the coach's own **non-legacy
      categories** (`parent_id` NULL, `competency_group` not NULL); anything else → 400 (another
      coach's → 403). A legacy row is never a parent or a sub-category (R-047), and a
      sub-category never has sub-categories. Moving a sub-category to another category is not
      offered.
    - **Creating.** `POST /evaluation_competency` accepts `parentId` with `{name}` or with a
      sub-level `{catalogueKey}` (a `technique` / `tactics` group entry). A sub-level catalogue
      entry sent without `parentId` goes under the coach's category keyed by its group word
      (rule 1), which is created active if the coach lacks it. A `general` entry never takes a
      `parentId` → 400. When the coach already holds a row of that default category's name (a
      legacy "Técnica"), no category is created and the entry is created as a category itself, as
      the migration leaves such rows.
    - **Reading.** Every item of `competencies` gains `parentId` (null for a category). The order
      of rule 5 holds; a client builds the tree from `parentId`.
    - **Offered defaults.** The manager offers each catalogue sub-category the coach lacks under
      the coach's category that holds its group word's key; while the coach holds no such
      category (renamed or deleted), those entries are offered with that default category, which
      adding brings back first.
    - **Switching.** Each row keeps its own flag. A sub-category is offered on an entry form
      whenever it is active, **whatever its category's flag**; a category's flag governs only the
      category's own row. So a coach who, before PAD-431, had Técnica switched off and Smash on
      keeps Smash on the form. Switching a category off changes none of its sub-categories.
16. **(PAD-431 D1, D6) What is scored.** A category with at least one active sub-category is
    **not offered** for scoring: its sub-categories are. A category with none (Consistência, or a
    category whose sub-categories are all off) is scored directly. A score a category already
    holds stays where it is — on its history cards and in its own evolution — as a **history
    score**. A score that arrives for such a category anyway (an older client whose form still
    lists it flat) is **stored the same way, never dropped**: it is a history score, not refused
    and not discarded, and `PUT /evaluation_record` answers as for any score.
17. **(PAD-431) Figures never mix levels.** Every figure that combines ratings (the monthly and
    rolling means of `evaluations.evolution`, the shared lines of `evaluations.sharing`) is per
    competency, as today; nothing derives a category's figure from its sub-categories, and any
    future figure that combines competencies counts **scored leaves only** — a history score on a
    category with sub-categories is never added in.

### Touches
- `settings.role-scope` — its coach-only Preferences list names "evaluation categories"; the
  building slice changes that to the competency editor and amends its criteria.
- `players.profile` — no change from this leaf.

### Acceptance Criteria

#### A coach with categories keeps them and gets no catalogue row (rules 2, 4)
- **Given** coach Ana holding "Forehand" (1–10, 12 scores) when the migration runs
- **When** she calls `GET /api/app/evaluation_competencies`
- **Then** `competencies` is one item: Forehand, `group: null`, `key: null`, `scaleMin` 1,
  `scaleMax` 10, `isActive: true`, `scoreCount` 12
- **And** `catalogue` holds all 17 entries and no `evaluation_categories` row was created

#### A coach with nothing starts with the three general competencies (rule 4) — superseded
- **Superseded by PAD-431:** see "A new coach starts with the whole default tree" below.

#### A catalogue twin is hidden (rule 4)
- **Given** coach Carla holds a legacy category named "bandeja" (0–10)
- **When** she reads her competencies and then posts `{"catalogueKey": "bandeja"}`
- **Then** `catalogue` has 16 entries without `bandeja`, and the POST answers 409

#### Switching off keeps the ratings and drops the form row (rule 7)
- **Given** Rui holds Volley 4 in a record dated 2026-08-14 and Volley (id 14) is active
- **When** Ana sends `PATCH /api/app/evaluation_competency/14` with `{"isActive": false}`
- **Then** the response has `isActive: false` and `scoreCount` 1
- **And** the next "Nova avaliação" form for Rui has no Volley row, while his 2026-08-14 history
  card still shows Volley 4 and `competenciesWithData` still contains 14

#### Falsy values mean what they say (rule 10)
- **Given** the custom competency "Saque cruzado" (id 13), active, `sort_order` 3
- **When** Ana sends `PATCH /api/app/evaluation_competency/13` with `{"sortOrder": 0}`
- **Then** `sort_order` is 0 and `is_active` is still true (the absent key changed nothing)
- **When** she sends `{"isActive": false}`
- **Then** `is_active` is false and `sort_order` is still 0

#### A duplicate custom name is refused (rule 6)
- **Given** Ana holds "Saque cruzado"
- **When** she posts `POST /api/app/evaluation_competency` with `{"name": "  saque cruzado "}`
- **Then** the response is 409 and she still holds one such row

#### Rename by id keeps the ratings (rule 8, resolves B-125)
- **Given** "Saque cruzado" (id 13) with 5 scores
- **When** Ana sends `PATCH /api/app/evaluation_competency/13` with `{"name": "Serviço cruzado"}`
- **Then** row 13 is renamed, she holds no second row, and `scoreCount` is still 5

#### Renaming a default makes it the coach's own (rule 8, PAD-431)
- **Given** Ana's catalogue sub-category Bandeja (id 12, under Técnica id 3) with 4 scores
- **When** she sends `PATCH …/12` with `{"name": "Bandeja alta"}`
- **Then** row 12 is named "Bandeja alta" with `key: null`, `group: "custom"`, `parentId: 3` and
  `scoreCount` 4, and `catalogue` offers `bandeja` again

#### Deleting a category takes its sub-categories with it (rule 9, PAD-431)
- **Given** Ana's category Tática (id 4) with sub-categories Transição (6 scores) and Jogo em dupla
  (2 scores), over 3 players
- **When** she calls `GET …/4/impact`, then `DELETE …/4`
- **Then** the impact is `{"name": "Tática", "scores": 8, "players": 3}`, the three rows and 8 scores
  are gone, one `deletion_audit` row names Tática and its two sub-categories, and `catalogue` offers
  `tactics` and its five entries again

#### A new coach starts with the whole default tree (rules 4, 15)
- **Given** coach Bruno with no `evaluation_categories` row
- **When** he calls `GET /api/app/evaluation_competencies` twice
- **Then** he holds 17 rows, not 34: Consistência with no sub-category, Tática with its 5 and Técnica
  with its 9, each sub-category's `parentId` its category's id, all active, and `catalogue` is empty
- **And** `GET /api/app/evaluation_categories` (legacy) still answers `[]` for him

#### Two levels only; legacy stays out of the tree (rule 15)
- **Given** Ana's sub-category Víbora (id 20), her legacy "Forehand" (id 9) and Bruno's category id 50
- **When** she posts `{"name": "X", "parentId": 20}`, `{"name": "Y", "parentId": 9}` and
  `{"name": "Z", "parentId": 50}`
- **Then** they answer 400, 400 and 403, and nothing is created

#### A category with active sub-categories is not offered; a stray score for it is kept (rule 16)
- **Given** Técnica (id 3) with the active sub-category Víbora, and Consistência with none
- **When** Ana opens "Nova avaliação" for Rui
- **Then** the form offers Víbora and Consistência and no Técnica input
- **When** an older client sends `PUT /evaluation_record` with a Técnica score of 4
- **Then** the save succeeds, the score is stored on Técnica and shows on that record's card as a
  history score, and no figure for Víbora or any other competency changes

#### A category is scored directly again once its sub-categories are all off (rule 16)
- **Given** Técnica (id 3) whose only sub-categories, Víbora and Smash, are both switched off
- **When** Ana opens "Nova avaliação" for Rui
- **Then** the form offers a Técnica input
- **When** she switches Smash back on and opens the form again
- **Then** the form offers Smash and no Técnica input

#### Existing technique and tactics rows are placed under their category (migration, PAD-431)
- **Given** coach Carla holds the catalogue rows Víbora and Smash (group `technique`), no Técnica row,
  and the custom "Saque cruzado"
- **When** the PAD-431 migration runs
- **Then** a Técnica row exists for her, active, and Víbora's and Smash's `parent_id` is its id;
  "Saque cruzado" and every legacy row keep `parent_id` NULL; no name, scale or score changed

#### Delete shows its impact and is audited (rule 9)
- **Given** "Saque cruzado" (id 13) with 5 scores across 2 players
- **When** Ana calls `GET /api/app/evaluation_competency/13/impact`, then `DELETE
  /api/app/evaluation_competency/13`
- **Then** the impact is `{"name": "Saque cruzado", "scores": 5, "players": 2}`, the row and its
  5 scores are gone, and one `deletion_audit` row names it with `"scores": 5`

#### The manager opens over the page and applies each change when made (rules 11, 12)
- **Given** coach Ana on Rui's player page, and the catalogue competency Smash switched off
- **When** she opens "Gerir competências", switches Smash on and presses "Concluído"
- **Then** the server held Smash as active before she closed, she is back on Rui's page with
  no flag in the URL, and the next "Nova avaliação" form lists Smash
- **And** the manager called no legacy evaluation endpoint

#### A competency created from the class panel appears in its open form (rule 12, PAD-422)
- **Given** coach Ana in a class's evaluation panel, with Rui's evaluation form open
- **When** she opens "Gerir competências" from the panel, creates the custom competency "Bandeja"
  and presses "Concluído"
- **Then** Rui's still-open form lists "Bandeja", without a reload
- **And** the same holds on iOS

#### An existing coach opens onto their own categories (rule 5, Q31)
- **Given** Ana holds the legacy "Forehand" (1–10) and has switched nothing else on
- **When** she opens the manager
- **Then** the first section is "As tuas categorias" with Forehand, switched on, showing "1–10"
  and no stars; "Geral", "Técnica" and "Tática" follow with every entry switched off; there is
  no empty "Personalizada"

#### Switching an entry on for the first time does not move it (rule 5)
- **Given** coach Bruno, for whom Smash has never been a row — it is the sixth entry of "Técnica"
- **When** he switches Smash on, and the list is read again
- **Then** Smash is a row now and is still the sixth entry of "Técnica"; switching it off again
  moves nothing either

#### A student sees no manager (rule 11)
- **Given** an authenticated student
- **When** they open a link carrying `?competencies=open` (web) or `/competencies` (iOS)
- **Then** no manager is shown

### Notes
- ASSUMED by the building slice (PAD-373), none of them in the canvas: (1) "Técnica" and
  "Tática" as both a group and a competency get no disambiguation beyond the group heading;
  (2) reordering (`sortOrder`) has no UI — the API accepts it, the manager never sends it;
  (3) rename is an inline edit on the row (pencil → field → save or Enter), for custom and
  legacy rows only.
- RESOLVED by PAD-431 (D150, 2026-09-26): AV-020's "Técnica"/"Tática" as both a group and a
  competency is now a parent link — the group word names the default category (rule 1, rule 15).
- **PAD-431 migration (D2).** Adds `parent_id` (guarded DDL, idempotent) and, per coach, sets each
  `technique` / `tactics` group row's `parent_id` to the coach's row keyed `technique` /
  `tactics`, creating that row (on the coach's scale, active iff one of its sub-categories is
  active) when the coach lacks it. If a coach already holds a row with that category's name
  (a legacy "Técnica", say), no row is created and those sub-level rows stay top-level. `general`,
  `custom` and legacy rows keep `parent_id` NULL. No name, scale, flag or score is changed.
  Downgrade drops the column; rows the migration created stay (they are ordinary catalogue rows).
- OPEN: storing the Portuguese label in `name` (rule 1) is a storage convenience; shells must
  display the i18n label by `key` and never the stored name for a catalogue row.
