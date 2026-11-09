---
id: evaluations.competencies
status: implementing
depends_on: [evaluations.categories, evaluations.legacy-client-contract]
serves: [P-EVALUATIONS-1]
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
   A legacy row stays legacy unless the coach converts it into a default category (rule 18).
   Nothing turns a row legacy.
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
      sub-category never has sub-categories.
    - **Moving (PAD-480, reverses D150's "moving is not offered").** A non-legacy row that is not a
      default category and holds no sub-categories can be moved under any of the coach's own
      non-legacy categories; a custom one can also go to the top level. `PATCH /evaluation_competency/<id>`
      `{parentId: <id>}` moves it under that category; `{parentId: null}` makes a custom row a category; an
      absent `parentId` changes nothing (rule 10), so a client that sends only `name`, `isActive` or
      `sortOrder` (every build before PAD-480) never detaches a row. A move to the parent the row
      already has is a no-op (200). Refused, 400 `parent_invalid`, nothing written: a legacy row or a
      legacy target (R-047); a default category (`general`) as the row; a row with sub-categories; a
      target that is itself a sub-category, or a sub-level catalogue row at the top level (a stray: it
      could then not be moved under its default); the row itself; `{parentId: null}` for a catalogue
      row (it would be a stray, B-255). Another coach's row or target → 403. A
      move keeps the row's id, name, flag, scores and each score's scale, and sets its `sortOrder` to
      `null`, so it sorts after its new siblings' ordered rows, by name (rule 8). Rule 16 then decides
      afresh what is scored for the old and the new category, and rule 9's cascade and impact follow
      the new parent. A move, and a create with `parentId`, hold the coach's row (`SELECT … FOR
      UPDATE`) before reading the tree, so two at once cannot leave three levels. The manager offers
      the move as a row action, "Mover para…", listing the eligible categories and, for a custom row,
      "Sem categoria".
    - **No new strays (PAD-480, B-255).** Where a legacy row holds a default category's name, the
      manager does not offer that default's sub-categories: they could not belong to it (the next
      bullet's API path would create each as a category of its own). The API path stays.
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
18. **(PAD-480, owner decision 2026-10-02; R-047 rule 9) Converting a legacy category into a
    default category.** `POST /api/app/evaluation_competency/<id>/convert` with `{catalogueKey}`
    (`technique`, `tactics` or `consistency`) turns one of the coach's legacy rows into that default
    category. Only the coach's explicit act does this.
    - **What changes.** `competency_group` becomes `general` and `catalogue_key` the key; `name`
      becomes the default's Portuguese label (rule 1); `scale_min`/`scale_max` become the coach's
      scale (`evaluations.scale` rule 2).
    - **What stays.** Its id, `is_active`, `sort_order` and `parent_id` (NULL), and every score on
      it, each on its own scale snapshot (`evaluations.scale` rules 3, 6).
    - **Afterwards** it is the coach's default category in every respect: it holds sub-categories
      (rule 15, and the manager offers the default's missing ones under it), rule 16 decides what is
      scored, and it can be renamed (rule 8) or deleted (rule 9).
    - **Refused, nothing written, checked in this order:** 404 `competency_not_found` (no such row)
      and 403 another coach's row; 400 `body_invalid` (the body is not an object); 400
      `catalogue_key_invalid` (absent, not a string, or not a `general` key); 400 `not_legacy` (the
      row is not legacy); 409 `default_held` (the coach holds a row with that `catalogue_key`); 409
      `name_taken` (another of the coach's rows holds the label, compared as rule 6 does). A request
      that loses a race to another row on the (coach, key) or (coach, name) index is answered the
      same way. A score on the row that the PAD-423 backfill left without a snapshot is stamped with
      the row's old scale before the row takes the coach's scale, so every score keeps its own.
    - **The server matches no names.** The manager offers "Converter em categoria padrão" on a
      legacy row whose name, trimmed, whitespace-collapsed, case- and accent-folded, equals an alias
      of a default the coach does not hold: its pt and en labels, and "tactica" for `tactics`
      (`SUGGESTION_ALIASES`, `packages/config/src/competency-manager.ts`). The fold only suggests;
      rules 4, 6 and 15 keep their own comparison. Where a legacy row suggests a default, the manager
      offers the conversion instead of that default's "add" (the server still accepts the POST).
      The dialog names the target (changeable to another unheld default) and the consequences, and
      lists the default's top-level sub-level rows (rule 15's strays, e.g. Bandeja) to move under it,
      checked; after converting, the client moves each with rule 15's `PATCH {parentId}`, and says
      which, if any, it could not move (they stay where they were, offered "Mover para…").
    - **Not reversible:** nothing turns it back.
    - **Known limits.** (a) App Store builds 27 and 28 predate this rule: their manager offers the
      default's "add" beside the legacy row, and a default added there is held, so the legacy row
      no longer offers conversion on web and iOS; deleting the empty default brings the offer back.
      (b) App Store 1.1.0's editor posts its whole category list with the names it read; saved
      after the conversion from a list read before it, the legacy upsert (R-047 rule 5) creates a
      legacy row with the old name, empty at first; the next 1.1.0 evaluation save posts it a
      midpoint score (3 on 1–5), as it does every legacy category. The coach can delete it (rule 9).

### Touches
- `settings.role-scope` — its coach-only Preferences list names "evaluation categories"; the
  building slice changes that to the competency editor and amends its criteria.
- `players.profile` — no change from this leaf.

### Acceptance Criteria

#### EVALUATIONS-COMPETENCIES-1: A coach with categories keeps them and gets no catalogue row (rules 2, 4)
- **Given** coach Ana holding "Forehand" (1–10, 12 scores) when the migration runs
- **When** she calls `GET /api/app/evaluation_competencies`
- **Then** `competencies` is one item: Forehand, `group: null`, `key: null`, `scaleMin` 1,
  `scaleMax` 10, `isActive: true`, `scoreCount` 12
- **And** `catalogue` holds all 17 entries and no `evaluation_categories` row was created

#### EVALUATIONS-COMPETENCIES-2: A coach with nothing starts with the three general competencies (rule 4) — superseded
- **Superseded by PAD-431:** see "A new coach starts with the whole default tree" below.

#### EVALUATIONS-COMPETENCIES-3: A catalogue twin is hidden (rule 4)
- **Given** coach Carla holds a legacy category named "bandeja" (0–10)
- **When** she reads her competencies and then posts `{"catalogueKey": "bandeja"}`
- **Then** `catalogue` has 16 entries without `bandeja`, and the POST answers 409

#### EVALUATIONS-COMPETENCIES-4: Switching off keeps the ratings and drops the form row (rule 7)
- **Given** Rui holds Volley 4 in a record dated 2026-08-14 and Volley (id 14) is active
- **When** Ana sends `PATCH /api/app/evaluation_competency/14` with `{"isActive": false}`
- **Then** the response has `isActive: false` and `scoreCount` 1
- **And** the next "Nova avaliação" form for Rui has no Volley row, while his 2026-08-14 history
  card still shows Volley 4 and `competenciesWithData` still contains 14

#### EVALUATIONS-COMPETENCIES-5: Falsy values mean what they say (rule 10)
- **Given** the custom competency "Saque cruzado" (id 13), active, `sort_order` 3
- **When** Ana sends `PATCH /api/app/evaluation_competency/13` with `{"sortOrder": 0}`
- **Then** `sort_order` is 0 and `is_active` is still true (the absent key changed nothing)
- **When** she sends `{"isActive": false}`
- **Then** `is_active` is false and `sort_order` is still 0

#### EVALUATIONS-COMPETENCIES-6: A duplicate custom name is refused (rule 6)
- **Given** Ana holds "Saque cruzado"
- **When** she posts `POST /api/app/evaluation_competency` with `{"name": "  saque cruzado "}`
- **Then** the response is 409 and she still holds one such row

#### EVALUATIONS-COMPETENCIES-7: Rename by id keeps the ratings (rule 8, resolves B-125)
- **Given** "Saque cruzado" (id 13) with 5 scores
- **When** Ana sends `PATCH /api/app/evaluation_competency/13` with `{"name": "Serviço cruzado"}`
- **Then** row 13 is renamed, she holds no second row, and `scoreCount` is still 5

#### EVALUATIONS-COMPETENCIES-8: Renaming a default makes it the coach's own (rule 8, PAD-431)
- **Given** Ana's catalogue sub-category Bandeja (id 12, under Técnica id 3) with 4 scores
- **When** she sends `PATCH …/12` with `{"name": "Bandeja alta"}`
- **Then** row 12 is named "Bandeja alta" with `key: null`, `group: "custom"`, `parentId: 3` and
  `scoreCount` 4, and `catalogue` offers `bandeja` again

#### EVALUATIONS-COMPETENCIES-9: Deleting a category takes its sub-categories with it (rule 9, PAD-431)
- **Given** Ana's category Tática (id 4) with sub-categories Transição (6 scores) and Jogo em dupla
  (2 scores), over 3 players
- **When** she calls `GET …/4/impact`, then `DELETE …/4`
- **Then** the impact is `{"name": "Tática", "scores": 8, "players": 3}`, the three rows and 8 scores
  are gone, one `deletion_audit` row names Tática and its two sub-categories, and `catalogue` offers
  `tactics` and its five entries again

#### EVALUATIONS-COMPETENCIES-10: A new coach starts with the whole default tree (rules 4, 15)
- **Given** coach Bruno with no `evaluation_categories` row
- **When** he calls `GET /api/app/evaluation_competencies` twice
- **Then** he holds 17 rows, not 34: Consistência with no sub-category, Tática with its 5 and Técnica
  with its 9, each sub-category's `parentId` its category's id, all active, and `catalogue` is empty
- **And** `GET /api/app/evaluation_categories` (legacy) still answers `[]` for him

#### EVALUATIONS-COMPETENCIES-11: Two levels only; legacy stays out of the tree (rule 15)
- **Given** Ana's sub-category Víbora (id 20), her legacy "Forehand" (id 9) and Bruno's category id 50
- **When** she posts `{"name": "X", "parentId": 20}`, `{"name": "Y", "parentId": 9}` and
  `{"name": "Z", "parentId": 50}`
- **Then** they answer 400, 400 and 403, and nothing is created

#### EVALUATIONS-COMPETENCIES-12: A category with active sub-categories is not offered; a stray score for it is kept (rule 16)
- **Given** Técnica (id 3) with the active sub-category Víbora, and Consistência with none
- **When** Ana opens "Nova avaliação" for Rui
- **Then** the form offers Víbora and Consistência and no Técnica input
- **When** an older client sends `PUT /evaluation_record` with a Técnica score of 4
- **Then** the save succeeds, the score is stored on Técnica and shows on that record's card as a
  history score, and no figure for Víbora or any other competency changes

#### EVALUATIONS-COMPETENCIES-13: A category is scored directly again once its sub-categories are all off (rule 16)
- **Given** Técnica (id 3) whose only sub-categories, Víbora and Smash, are both switched off
- **When** Ana opens "Nova avaliação" for Rui
- **Then** the form offers a Técnica input
- **When** she switches Smash back on and opens the form again
- **Then** the form offers Smash and no Técnica input

#### EVALUATIONS-COMPETENCIES-14: Existing technique and tactics rows are placed under their category (migration, PAD-431)
- **Given** coach Carla holds the catalogue rows Víbora and Smash (group `technique`), no Técnica row,
  and the custom "Saque cruzado"
- **When** the PAD-431 migration runs
- **Then** a Técnica row exists for her, active, and Víbora's and Smash's `parent_id` is its id;
  "Saque cruzado" and every legacy row keep `parent_id` NULL; no name, scale or score changed

#### EVALUATIONS-COMPETENCIES-15: Delete shows its impact and is audited (rule 9)
- **Given** "Saque cruzado" (id 13) with 5 scores across 2 players
- **When** Ana calls `GET /api/app/evaluation_competency/13/impact`, then `DELETE
  /api/app/evaluation_competency/13`
- **Then** the impact is `{"name": "Saque cruzado", "scores": 5, "players": 2}`, the row and its
  5 scores are gone, and one `deletion_audit` row names it with `"scores": 5`

#### EVALUATIONS-COMPETENCIES-16: The manager opens over the page and applies each change when made (rules 11, 12)
- **Given** coach Ana on Rui's player page, and the catalogue competency Smash switched off
- **When** she opens "Gerir competências", switches Smash on and presses "Concluído"
- **Then** the server held Smash as active before she closed, she is back on Rui's page with
  no flag in the URL, and the next "Nova avaliação" form lists Smash
- **And** the manager called no legacy evaluation endpoint

#### EVALUATIONS-COMPETENCIES-17: A competency created from the class panel appears in its open form (rule 12, PAD-422)
- **Given** coach Ana in a class's evaluation panel, with Rui's evaluation form open
- **When** she opens "Gerir competências" from the panel, creates the custom competency "Bandeja"
  and presses "Concluído"
- **Then** Rui's still-open form lists "Bandeja", without a reload
- **And** the same holds on iOS

#### EVALUATIONS-COMPETENCIES-18: An existing coach opens onto their own categories (rule 5, Q31)
- **Given** Ana holds the legacy "Forehand" (1–10) and has switched nothing else on
- **When** she opens the manager
- **Then** the first section is "As tuas categorias" with Forehand, switched on, showing "1–10"
  and no stars; "Geral", "Técnica" and "Tática" follow with every entry switched off; there is
  no empty "Personalizada"

#### EVALUATIONS-COMPETENCIES-19: Switching an entry on for the first time does not move it (rule 5)
- **Given** coach Bruno, for whom Smash has never been a row — it is the sixth entry of "Técnica"
- **When** he switches Smash on, and the list is read again
- **Then** Smash is a row now and is still the sixth entry of "Técnica"; switching it off again
  moves nothing either

#### EVALUATIONS-COMPETENCIES-20: A student sees no manager (rule 11)
- **Given** an authenticated student
- **When** they open a link carrying `?competencies=open` (web) or `/competencies` (iOS)
- **Then** no manager is shown

#### EVALUATIONS-COMPETENCIES-21: A row moves under another category, and back (rule 15 "Moving", PAD-480)
- **Given** coach Ana's top-level catalogue sub-category Bandeja (id 12, 4 scores, sortOrder 2) and her
  custom category Grit (id 30) with no sub-categories
- **When** she sends `PATCH /api/app/evaluation_competency/12` `{"parentId": 30}`
- **Then** Bandeja's `parentId` is 30, its `sortOrder` is null, its 4 scores and their scales are
  unchanged, and Grit (now holding an active sub-category) is no longer offered for scoring (rule 16)
- **When** she sends `{"parentId": null}`
- **Then** Bandeja is a category again, scored directly

#### EVALUATIONS-COMPETENCIES-22: A move that breaks the two levels or R-047 is refused, and nothing changes (rule 15, PAD-480)
- **Given** Ana's legacy "Forehand" (id 7), her Consistência (id 3, `general`), Grit (id 30) with the
  sub-category Recuperação (id 31), Bandeja (id 12) and Bruno's category id 50
- **When** she moves 7 under 30; 12 under 7; 3 under 30; 30 under another category; 12 under 31;
  12 under 12; 12 under 50
- **Then** each is 400 `parent_invalid` (403 for 50) and no row changes

#### EVALUATIONS-COMPETENCIES-23: A move to the parent the row already has changes nothing (rule 15, PAD-480)
- **Given** Recuperação (id 31) under Grit (id 30), sortOrder 1
- **When** Ana sends `{"parentId": 30}`
- **Then** 200, and parentId 30 and sortOrder 1 are kept

#### EVALUATIONS-COMPETENCIES-24: An edit that does not send parentId keeps the parent (rule 15, PAD-480)
- **Given** Recuperação (id 31) under Grit (id 30)
- **When** a client sends `{"name": "Recuperação ativa"}` or `{"isActive": false}`
- **Then** its `parentId` is still 30

#### EVALUATIONS-COMPETENCIES-25: Deleting the new parent takes the moved row with it (rules 9, 15; PAD-480)
- **Given** Bandeja (id 12, 4 scores) moved under Grit (id 30)
- **When** Ana reads the impact of deleting Grit, then deletes it
- **Then** the impact counts Bandeja's 4 scores, and Bandeja and its scores are gone with Grit

#### EVALUATIONS-COMPETENCIES-26: No sub-categories are offered under a default whose name a legacy row holds (rule 15, B-255)
- **Given** coach Rui holds a legacy " Técnica " and no Técnica row
- **When** he opens "Definir categorias de avaliação"
- **Then** no Técnica heading offers sub-categories; his top-level catalogue rows are still listed

#### EVALUATIONS-COMPETENCIES-27: A legacy row converts into a default category and keeps its scores (rule 18, PAD-480)
- **Given** coach Ana holds the legacy " Técnica " (id 5, 1–5) with Rui's score 4
- **When** she posts `{"catalogueKey": "technique"}` to `/evaluation_competency/5/convert`
- **Then** row 5 has `key` technique, `group` general, `name` "Técnica", the same flag and order,
  and Rui's score is still 4 on 1–5

#### EVALUATIONS-COMPETENCIES-28: The converted row takes the coach's scale; its scores keep the one they were given on (rule 18)
- **Given** Ana's scale is 1–10 and her legacy " Técnica " holds a 4 given on 1–5
- **When** she converts it
- **Then** the row is 1–10 and the score is still 4 with its 1–5 snapshot

#### EVALUATIONS-COMPETENCIES-29: A conversion that cannot be made is refused, and nothing changes (rule 18)
- **Given** Ana's custom "Grit", her legacy " Técnica " and "técnica", and a held "Tática"
- **When** she converts Grit (400 `not_legacy`), " Técnica " to `bandeja` or with no key (400
  `catalogue_key_invalid`), " Técnica " to `tactics` (409 `default_held`), " Técnica " to
  `technique` (409 `name_taken`)
- **Then** no row and no score changed

#### EVALUATIONS-COMPETENCIES-30: After conversion the old builds' endpoints no longer see it (rule 18, R-047 rule 9)
- **Given** Ana converted " Técnica " (id 5), which holds a score
- **When** an App Store 1.1.0 build lists categories, reads the profile, posts a score for 5, and
  deletes 5 through the legacy endpoint
- **Then** 5 is not listed and not on the profile, the score is answered 200 and not stored, and
  the delete is 403

#### EVALUATIONS-COMPETENCIES-31: A stale 1.1.0 editor recreates the old name as an empty legacy row (rule 18 known limit)
- **Given** Ana converted " Técnica "
- **When** a 1.1.0 editor read before the conversion posts `[{"name": " Técnica ", …}]`
- **Then** a new, empty legacy " Técnica " exists beside the converted "Técnica", which is unchanged,
  and Ana can delete it

#### EVALUATIONS-COMPETENCIES-32: The converted row holds the default's sub-categories (rules 15, 18)
- **Given** Ana converted " Técnica " (id 5); her Smash was created top-level before it
- **When** she adds `{"catalogueKey": "vibora"}` and moves Smash with `{parentId: 5}`
- **Then** both have `parentId` 5

#### EVALUATIONS-COMPETENCIES-33: The manager offers the conversion, not the add, for a default a legacy row suggests (rule 18)
- **Given** Ana holds the legacy "Tactica " and no "Tática"
- **When** she opens the manager
- **Then** "Tactica " offers "Converter em categoria padrão" with Tática as the target, and Tática
  is not offered as "add"; a legacy "Tática avançada" offers nothing

#### EVALUATIONS-COMPETENCIES-34: A move that fails after the conversion is said (rule 18)
- **Given** Ana converts " Técnica " with Bandeja and Serviço checked, and the move of Serviço fails
- **When** the conversion and the moves have answered
- **Then** the dialog says " Técnica " is now Técnica and Serviço was not moved, and Serviço still
  offers "Mover para…"

#### EVALUATIONS-COMPETENCIES-35: Switching a default on creates its row once, and off it stays the coach's own (rules 5, 6, 7)
- **Given** a coach with no Bandeja row
- **When** they POST `{"catalogueKey": "bandeja"}`
- **Then** the answer is 201 with the row, active, on the coach's scale, and `bandeja` leaves `catalogue`
- **And** switching it off and posting the key again answers 200 with the same row, active again; an unknown key answers 400
- **And** a default that is switched off, or given an order, keeps its name, stays out of `catalogue`, and is listed before the legacy rows
test: `backend/padel_app/tests/test_pad364_competencies_api.py` › `test_switching_a_catalogue_competency_on_creates_its_row_once` (+1 more)

#### EVALUATIONS-COMPETENCIES-36: Racing requests for the same row leave one (rules 4, 6)
- **Given** two requests creating the same competency at once
- **When** the second reaches the insert after the first committed
- **Then** one row exists; a request by catalogue key answers 200 with that row, and one by name answers 409 `duplicate_name`
- **And** a coach whose starting set was written by a concurrent request still has it exactly once
test: `backend/padel_app/tests/test_pad364_competencies_api.py` › `test_a_lost_race_for_the_starting_set_does_not_double_it` (+3 more)

#### EVALUATIONS-COMPETENCIES-37: A sub-category is created under a category, and a default sub-category finds its default parent (rule 15)
- **Given** a coach with a custom category Grit and no Técnica row
- **When** they create "Recuperação" with `parentId` Grit
- **Then** the answer is 201 with that parent and the group `custom`
- **And** switching on `bandeja` with no parent creates the default Técnica, active, and puts Bandeja under it
- **And** putting a default category under another category answers 400
test: `backend/padel_app/tests/test_pad431_categories_api.py` › `test_a_sub_category_is_created_under_a_category`

#### EVALUATIONS-COMPETENCIES-38: A category's figures never take in its sub-categories' scores (rule 17)
- **Given** one record rating Técnica 2 and its sub-category Víbora 5
- **When** the monthly means are computed for each
- **Then** Técnica's mean is 2 and Víbora's is 5
test: `backend/padel_app/tests/test_pad431_categories_api.py` › `test_a_category_mean_never_takes_in_its_sub_categories`

#### EVALUATIONS-COMPETENCIES-39: Text typed in the manager survives a change of language or a reload of the list (rule 11, PAD-399)
- **Given** the iOS manager with a name typed in the add field, or in the delete confirmation
- **When** the language settles or the list is read again
- **Then** the typed text is still there and nothing was sent
- **And** a successful add clears the add field
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `keeps a typed custom-competency name when the language settles afterwards` (+3 more)

#### EVALUATIONS-COMPETENCIES-40: The manager lists each category with its sub-categories, in a fixed order (rules 5, 15; web and iOS)
- **Given** a coach's competencies and the defaults they lack
- **When** the manager lists them
- **Then** each category heads a section holding its sub-categories and the default sub-categories still on offer, in the catalogue's order with held and offered rows interleaved and the coach's own sub-categories last
- **And** a new coach sees the three default categories with their nine and five sub-categories; a coach's own category is a section of its own; legacy rows are kept apart from custom ones, and a switched-off row does not move
- **And** a renamed default keeps its sub-categories while the default is offered again with what the coach lacks; a row whose category is missing from the list is shown on its own
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `each category heads its section, with its sub-categories and the defaults it lacks under it` (+11 more)

#### EVALUATIONS-COMPETENCIES-41: The evaluation form groups sub-categories under their category and lists what can be rated (rules 15, 16)
- **Given** categories with active sub-categories, a category with none, and a legacy row
- **When** the form lists its rows
- **Then** each category with active sub-categories is a heading over them, in the server's order, and is not itself a row
- **And** a category scored directly, and a legacy row, sit under no heading; a category whose sub-categories are all off becomes a plain row
- **And** an active sub-category is offered even when its category is switched off
- **And** a switched-off competency is listed only when the record being edited already rates it
test: `frontend/apps/mobile/src/features/evaluations/evaluation-categories-ui.test.tsx` › `a category heads the sub-categories offered under it` (+6 more)

#### EVALUATIONS-COMPETENCIES-42: Each row shows only the controls its kind allows (rules 2, 8, 9)
- **Given** the manager with a default row, a legacy row, a custom row and a default on offer
- **Then** a held default has its switch on, a rename and a delete; a legacy row shows its scale with a rename and a delete; a custom row has a delete and no scale; an offered default has its switch off
- **And** a row is a default when it has a catalogue key, legacy when it has no group, and custom otherwise
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `a default can be renamed and deleted (rules 8, 9)` (+2 more)

#### EVALUATIONS-COMPETENCIES-43: The manager adds a category, or a sub-category under a held one, and keeps what was typed when refused (rules 6, 11, 15)
- **Given** the manager
- **When** the coach types a name in a held category's add field and submits
- **Then** a sub-category is created with that name, trimmed, under that category; the top-level field creates a category with no parent; a default that is only on offer has no add field
- **And** a duplicate name shows the refusal beside the field and keeps the typed text; an empty name is never sent; a successful add empties the field
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `adds a sub-category under a held category by parentId; an offered default has no field` (+4 more)

#### EVALUATIONS-COMPETENCIES-44: The manager offers a row only the moves the two levels allow (rule 15; web and iOS)
- **Given** a coach's tree with defaults, custom categories, sub-categories and a legacy row
- **When** the coach opens a row's move panel
- **Then** a sub-category is offered every other category, and the top level only when it is the coach's own; a top-level default sub-category is offered every category
- **And** a legacy row, a default category, and a category that holds sub-categories offer no move
- **And** choosing a target sends that `parentId` (null for the top level) and closes the panel; a refused move says so on the row and the panel stays
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `a catalogue sub-category offers the other categories, never the top level; picking one sends parentId` (+12 more)

#### EVALUATIONS-COMPETENCIES-45: The conversion dialog says what happens, converts to the chosen default and moves the checked rows (rule 18; web and iOS)
- **Given** a coach with a legacy row the manager offers to convert, and top-level default rows of that default's group
- **When** the coach opens the conversion
- **Then** the dialog warns about the old app, has the suggested default selected, and offers to move those rows under it, checked
- **When** they confirm
- **Then** the row is converted to that default and each checked row is moved under it; unchecked, nothing is moved; another default can be chosen as the target
- **And** a refused conversion says why in the dialog and moves nothing
- **And** no conversion is offered for a default the coach already holds, or for a row that is not legacy
test: `frontend/apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx` › `the dialog says what happens, then converts and moves the checked strays under it` (+11 more)

#### EVALUATIONS-COMPETENCIES-46: The manager says when no competency is active (rule 13)
- **Given** a coach whose only row is switched off
- **When** the manager opens
- **Then** it says no competency is active; with one row on, it does not
test: `frontend/apps/web/src/components/evaluations/competency-manager/CompetencyManager.test.tsx` › `says what it means when nothing is active (rule 13)` (+2 more)

#### EVALUATIONS-COMPETENCIES-47: A change in flight locks its row, and a failed one rolls back and says so on that row (rule 11)
- **Given** the manager with an active custom row
- **When** the coach taps its switch twice while the first change is in flight
- **Then** one change is sent, and the switch is disabled until the answer
- **And** a change that fails puts the switch back and shows the failure on that row; a rename refused as a duplicate shows that on the row and can be retried
- **And** rows keep their places while changes land, and each switch ends where its own answer put it
test: `frontend/apps/web/src/components/evaluations/competency-manager/CompetencyManager.test.tsx` › `a second tap while the request is in flight sends nothing more, and the row is disabled meanwhile` (+4 more)

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

### Open questions

- **EVALUATIONS-COMPETENCIES-1 counts 17 catalogue entries for a coach who holds "Forehand", on a 1–10 scale.**
  - Criterion: "coach Ana holding "Forehand" (1–10, 12 scores) … `scaleMax` 10 … **And**
    `catalogue` holds all 17 entries".
  - Other statements: rule 4 and EVALUATIONS-COMPETENCIES-3 hide a catalogue entry whose name the
    coach already holds; `evaluations.legacy-conversion` rule 5 leaves no legacy category on 1–10.
  - Code today: `test_pad364_competencies_api.py` ›
    `test_the_list_carries_every_competency_and_the_catalogue_not_yet_switched_on` seeds Forehand
    and Volley at 1–5 and gets a catalogue of 15, without `forehand` and `volley`.
  - Recommendation: keep the criterion's point (a coach with categories is given no catalogue
    row) and correct its numbers.
  - Proposed Then: "`competencies` is one item: Forehand, `group: null`, `key: null`, `scaleMin`
    1, `scaleMax` 5, `isActive: true`, `scoreCount` 12", and "`catalogue` holds the 16 entries
    other than `forehand`, and no `evaluation_categories` row was created".
- **A note still says a default cannot be renamed.** Notes, item (3): "rename is an inline edit on
  the row … for custom and legacy rows only". Rule 8 (PAD-431 D4) says "**Any** row can be
  renamed, a catalogue one included", EVALUATIONS-COMPETENCIES-8 proves it, and both managers show
  the rename on a default row (EVALUATIONS-COMPETENCIES-42). Recommendation: delete "for custom
  and legacy rows only" from the note.
