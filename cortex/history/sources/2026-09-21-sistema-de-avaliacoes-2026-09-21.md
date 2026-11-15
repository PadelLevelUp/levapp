---
about: sistema-de-avaliacoes-2026-09-21
permanence: stable
verified: "2026-09-21 (observed)"
origin:
  - migrated:archive/documents/sistema-de-avaliacoes-2026-09-21@ef7a5f3
  - "external:Claude Design canvas handed over by the product owner on 2026-09-21 as the new evaluation system and evaluation style —…"
aliases:
  - archive.sistema-de-avaliacoes-2026-09-21
captured: "2026-09-21"
---

## summary

# Sistema de Avaliações (design canvas, 2026-09-21)

**Source:** `source.dc.html` (Claude Design canvas, 59 KB, 806 lines; markup L1–457, script
L458–804). **Kind:** design-canvas. **Language:** pt-PT, informal *tu*. **Scope:** the coach's
desktop web app only — no phone layout, no player-side screen, no English copy. All data is
in-memory mock state. Read in full; not rendered (its design-system bundle was not on disk).

## What the canvas proposes

1. **An evaluation is one record**: several competency ratings, one private note, a date, an
   optional class link and a sharing state — keyed by player, class-or-none and calendar day
   (AV-001, AV-002, AV-007, AV-008).
2. **Ratings are 1–5 stars, saved on tap**, for every competency; only what the coach rated is
   stored; evaluation stays optional and partial (AV-003–AV-006).
3. **Evaluating from the class**: a primary "Avaliações" action on the class detail opens a
   participant accordion — "Sem avaliação" / "N/M avaliadas" — to rate in place (AV-010–AV-015).
4. **A padel competency catalogue**: 17 built-in competencies in groups Geral, Técnica, Tática,
   three active by default, switched on and off without losing history, plus custom ones under
   "Personalizada" — "Gerir competências" (AV-020–AV-026).
5. **The player's evaluations drawer**: "Nova avaliação" outside a class; per-competency
   evolution as monthly averages with "Média mensal / semestral / anual" and a delta
   "↑ +1.5 desde Jan"; a history of dated cards (AV-030–AV-037).
6. **Sharing is explicit and selective**: "Partilhar avaliação" → choose competencies, an
   evolution period, and whether to include the note (off by default) → preview → "Partilhar";
   the card then reads "✓ Partilhada com o aluno em …" and what was shared is stored
   (AV-040–AV-043).
7. **"Frequência de avaliações"** in Definições: Nunca / Mensalmente (default) / A cada 2 aulas /
   A cada 4 aulas / Personalizado — a stored choice the canvas never acts on (AV-050).
8. A dark-mode switch in the shell (AV-060) — outside the evaluation system.

## What it declares out of scope

"Fora do âmbito": the views Painel, Treino and Mensagens, and the profile cards "Informação" and
"Pontos fortes e fracos". Inert chrome: the disabled profile actions and the class-detail
buttons other than "Avaliações" (AV-090).

## What it leaves open

The player's side of a shared evaluation; whether sharing notifies; what the reminder *is*; what
happens to existing scores on other scales; clearing a rating; editing, deleting or un-sharing;
phone layouts; English copy. See `open-questions.md` (7 owner decisions, 18 build defaults).

## Files

- `requirements.md` — AV-001…AV-090, each cited to canvas lines; section I lists edge states and
  mock defects found in the script.
- `screens.md` — every screen and state, navigation map, mock data.
- `tokens.md` — design-system components and semantic tokens used.
- `open-questions.md` — questions with recommended defaults.

The comparison with what ships is in the companion document
`../../sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md`.

## open-questions

# Open questions raised by the canvas

Raised 2026-09-21 during ingestion by Session-B. Each has a **recommended default** so work
that does not depend on the answer can start. **Owner** = changes what an evaluation means to a
coach or player, or what notifications people receive; these wait for the product owner.
**Build** = a default the build takes unless someone objects. Answers get recorded here and
carried into the specs. "Today" facts are from the current-state map summarised in
`../../sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md`.

## Owner decisions

**Q1 — What happens to existing scores and categories? (AV-003)**
Today every category has its own integer scale (editors default to 0–10) and scores are floats;
the canvas is 1–5 stars everywhere and says nothing about old data. Which scales are in use on
production has not been measured.
*Default:* non-destructive. Existing categories keep their scale and their numbers and stay
active; they are shown as "7/10", not as stars, and chart on their own scale. Every new
competency (catalogue or custom) is 1–5 stars. A coach-triggered "convert to stars" (proportional,
rounded, with a before/after preview) can follow as its own slice once production numbers are known.

**Q2 — Does the player see anything, and where? (AV-040–AV-043)**
Today the player sees no evaluation at all, and has no profile page and no notifications inbox on
web or iOS — a student's screens are dashboard, calendar, messages, availability (plus attendance,
absences and settings on web). The canvas shows only the coach's preview card.
*Default:* a player sees only what a coach shared: a new "Avaliações" block on the student
dashboard (web and iOS) listing shared cards newest first, each exactly as previewed, opening to a
full list. Nothing unshared is ever sent to a player's device.

**Q3 — Does sharing notify the player?**
Today every coach→student notice travels as a system message in the coach–student Messages thread
(message row + live update + web push + mobile push), and a plain text one cannot be switched off
by the student.
*Default:* yes — one system message per share in that thread ("{treinador} partilhou uma avaliação
contigo"), which pushes like any message and links to the card. Sharing is a deliberate coach
action, so volume is one per share; no separate opt-out in the first version, matching other
system messages. A text message also renders on App Store builds that know nothing of evaluations.

**Q4 — What is the reminder? (AV-050)**
The canvas stores a frequency and never shows a reminder.
*Default:* in-app only, no push, no e-mail. A player is *due* when "Mensalmente" → no evaluation
by this coach in the last 30 days; "A cada N aulas" → N classes attended with this coach since the
last one. Due players carry a marker in the class evaluation panel and on the players list. The
setting does not ship before the marker does. Existing coaches get the canvas default
("Mensalmente"), which with an in-app marker sends nothing.

**Q5 — May a coach share an evaluation recorded before sharing existed?**
*Default:* yes; old rows are grouped into records by coach–player and day and are shareable like
any other.

**Q6 — Un-share, and delete of a shared evaluation.**
The canvas has neither. *Default:* "Deixar de partilhar" removes the card from the player without
notifying; deleting an evaluation asks for confirmation and also un-shares it.

**Q7 — Does the at-a-glance list of current scores disappear?**
Today the profile shows the latest score per category. The canvas profile shows only "Última
avaliação em …" and moves everything into the drawer, where the latest values are visible only
through the newest history card. *Default:* follow the canvas.

## Build defaults (taken unless someone objects)

**Q8 — Clearing a rating (AV-006).** Tapping the lit star clears it. A record left with no rating
and no note is removed. This keeps PAD-337's guarantee that a coach can decline to score.

**Q9 — Editing the past (AV-002, AV-037).** A record is editable on the day it was made (the
canvas's own rule); afterwards it can be deleted, not edited.

**Q10 — Day boundary (AV-002).** The club's calendar day, not the server's UTC day and not a
device's: the date on `CLUB_TZ`, the constant in `backend/padel_app/utils/dates.py`
(`Europe/Lisbon`, the wall clock class times use — rule R-023). No per-coach or per-club zone is
stored today; if one ever is, a record's day, "editable on its day" and the evolution windows move
to it together (`evaluations.records` rule 3, rule R-048). Corrected 2026-09-21: this first said
"the coach's local day", which named a zone nothing stores.

**Q11 — A shared card is a snapshot (AV-043).** What the player sees is frozen at share time. If
the coach edits the record later the same day, the card offers "Atualizar partilha".

**Q12 — Evolution line when sharing (AV-042).** One line per selected competency, not only the
first. "Desde a última avaliação" = this rating minus the previous rating of that competency;
"Últimos 6 meses" / "Último ano" = latest monthly mean minus the first monthly mean inside the
window. A line is omitted when there is nothing to compare. Sharing needs at least one competency.

**Q13 — Delta colour (AV-035).** Green up, neutral for zero and down; zero prints "=" not "↑ +0".

**Q14 — Which participants a class lists (AV-012).** Everyone enrolled in that dated occurrence;
players marked absent are listed last and can still be rated.

**Q15 — The class link (AV-008).** The dated occurrence of the class, not the recurring series.

**Q16 — Catalogue and language (AV-020).** Catalogue competencies have a stable key and a label
in each shipped language (en, pt); custom ones are shown as typed.

**Q17 — Catalogue meets existing categories (AV-020, AV-024).** For a coach who already has
categories, those stay active and the catalogue arrives switched off, so nothing changes until the
coach opts in. For a new coach the three "Geral" competencies are active (AV-021). A coach's
existing category whose name equals a catalogue label is left alone and the catalogue twin is
hidden for that coach. Duplicate names stay forbidden (PAD-273).

**Q18 — Rename and delete (AV-022).** Catalogue competencies can only be switched off. Custom ones
can be renamed (by id — today's name-keyed save turns a rename into a new category) and deleted
with today's safeguards (impact count, typed name, audit row; PAD-274).

**Q19 — Where "Gerir competências" lives (AV-015).** In both evaluation panels and in Settings,
replacing today's category editor there.

**Q20 — Two coaches, one player.** As today, evaluations belong to the coach–player link; each
coach sees and shares only their own; the player's cards name the coach.

**Q21 — Strengths and weaknesses.** Out of scope per the canvas (AV-090) and left working. The
canvas's evaluation form has none, but today the web evaluation form is where a coach edits them
(iOS uses a separate profile card). They leave the web form only once a coach can edit them
somewhere else on web, proven to work; otherwise they stay in the form. Removing a working
capability is not a build default (Coordinator, 2026-09-21).

**Q22 — Bulk import.** Keeps writing the same tables; imported rows keep their scale (Q1) and are
grouped into records by player and date.

**Q23 — Phone layouts.** The canvas is desktop only. Drawers become full pages at phone width on
web and pushed screens on iOS; modals become sheets. Web and iOS ship in the same ticket.

**Q24 — Old App Store builds.** Withholding is **by endpoint, not by capability token**
(Coordinator-approved, 2026-09-21). The five endpoints App Store 1.0/1.1.0 call — `GET
/app/evaluation_categories`, `POST /app/add_evaluation_entry`, `GET /app/player_profile/<id>`
(`evaluations[]`), `POST /app/add_evaluation_categories`, `POST /app/delete/evaluation_category` —
keep their shape and list, return, accept and delete **legacy categories only**, unconditionally,
whatever headers a client sends; `evaluations[].evaluatedAt` is always a valid ISO instant. New
clients reach catalogue, custom and switched-off competencies through new endpoints only. A
catalogue competency is a row created when a coach switches it on, so an unused one exists for no
client. The `X-LevApp-Capabilities` token `evaluations` has one job: gating server-driven surfaces
an old build could mis-render — the student dashboard block of a shared evaluation (Q2).

**Q25 — iOS dark mode (AV-060).** Not part of this project; web already has a theme selector.

**Q26 — Ratings under a switched-off competency, today (AV-013, AV-070).** In the class panel and
the "Nova avaliação" form, a competency that already holds a rating in **today's** record is listed
even if it is switched off, so the summary "`N`/`M` avaliadas" never reads "Sem avaliação" while a
rating exists. `M` = active competencies plus any switched-off ones rated today. With nothing to
list at all (no active competency, none rated today — AV-071) the panels show an empty state with
a way into "Gerir competências", never a note-only form. Both modals get an explicit cancel/close
control (AV-072).

**Q27 — Two records on one day (AV-073).** A class record and a class-less record of the same day
are two history cards, as in the canvas.

**Q28 — Which record a class row shows (AV-013).** The participant's most recent record for that
occurrence, not only today's; it is editable only if it is today's, otherwise shown read-only with
its date, and the first tap today starts today's record for the same occurrence. The canvas only
models "today"; without this a coach opening yesterday's class reads "Sem avaliação" for players
they rated in it yesterday.

**Q29 — Same-day superseded scores (AV-001, AV-033).** Existing data can hold two scores of one
category on one day (the table was append-only). The latest sits in the day's record; the earlier
one is kept in the database and read by nothing in the new screens — no history card, no average,
no share. A day's evaluation has one value per competency, as in the canvas, and an average never
includes a number no card shows. The old App Store screens are untouched.

**Q30 — Past classes that were never opened (AV-010).** Opening a class that is over for the
first time enrols its whole roster as unmarked attendance and fills its waiting list. So the
class panel is offered for classes dated today or later and for any class already opened
(attendance taken, edited); for a past class never opened the action is disabled with an
explanation and the coach evaluates from the player.

## Rulings taken while the slices were being built (2026-09-21)

Build defaults like Q8–Q30: taken by the evaluation-system lead, reviewable by the Coordinator,
each written into the leaf it governs by the slice that implements it.

**Q31 — Where a coach's existing categories sit in "Gerir competências" (AV-022).** In a section
of their own, FIRST — "As tuas categorias", each with its scale written out — then Geral, Técnica,
Tática, Personalizada. The canvas models no such coach; following it literally put an existing
coach's own categories at the bottom of 17 entries they had not chosen. The order is static:
nothing moves when it is switched, including the first time a catalogue entry becomes a row, so
inside Geral, Técnica and Tática the order is the catalogue's own fixed order with rows and
not-yet-rows interleaved. A coach with no existing category sees exactly the canvas's order.
Client-side sectioning; the API's order is unchanged.

**Q32 — The three evolution figures are labelled by their window (AV-034).** "Médias: Último mês ·
Últimos 6 meses · Último ano" (en: "Averages: Last month · Last 6 months · Last year"), not "Média
mensal / semestral / anual". The arithmetic is the canvas's own and does not change (rolling
windows over the ratings). What changes is the word: on the first real rendering, the chart's
"Set: 7.0" (the calendar-month point) sat above "Média mensal 6.5" (the rolling figure) and read
as a contradiction. The vocabulary is the owner's — the share flow already says "Últimos 6 meses"
and "Último ano". "Último mês", not "30 dias": the window is calendar arithmetic. **The owner is
told, because it changes the canvas's copy.**

**Q33 — Nothing above a form that saves on tap changes shape in answer to that tap.** Found by the
first simulator run of the evolution slice: the first rating made "Evolução" appear above the open
form and moved the form about 350 pt under the coach's finger. The section keeps its shape while
the form is open and follows the server when it closes; the class panel applies the same to the
participant ORDER while a row is open. Same principle as Q31's static order. It governs
`evaluations.history`, `evaluations.evolution` and `evaluations.class-panel`.

**Q34 — A stepper's consecutive steps are one input (AV-004).** Stars save on tap, one request per
tap. A legacy-scale category is a stepper, and stepping 5 → 8 is one write, not three: debounced
about 400 ms per competency, and flushed on blur, on "Concluir avaliação", on close and on
unmount, so a quick step-then-close is never lost.

**Q35 — The class read says whether the class can be rated (`canRate`).** False exactly when the
occurrence has no row and its date is before today on the club's clock — the case Q30 refuses.
The clients disable the action from that fact and never compare a date with their own clock
(the same reason the evolution figures are the server's).

**Q36 — Two custom competency names that differ only in case.** Refused one after the other (409).
If two such requests race, both can be created: the unique index is case-sensitive, and a
case-insensitive one would need a migration that could fail on rows that are legal today. Left as
it is, and said so where the rule is written (`evaluations.competencies` rule 6).

**Q21 — outcome.** A web editor for strengths and weaknesses outside the evaluation form exists
(the `PlayerStrengthsWeaknesses` card on the player page, saved through `add_coach_note` /
`delete/coach_note`, the path iOS uses). Proven by Session-E before dropping them from the form:
`e2e/evaluation-tools/player-notes.spec.ts`, 2 passed, at `ddf6b1f14`, 2026-09-21 19:20:34–19:21:37
UTC (Session-E's run). So they leave the new web form and keep their own card on both clients.

**Q1 — what production holds (Session-A's read, 2026-09-21 20:58 UTC; its word).** Two coaches with
evaluations, 7 categories, 16 scores — all whole numbers on ONE scale, 1–10; no comments, no
imported rows. Both settings editors offer 0–10 for a new category and production has not one
`scale_min = 0` row: the shared form layer stores the default 1 (B-136, PAD-367). The default
above stands; "convert to stars" is one mapping, 1–10 → 1–5, over 16 rows, and the owner can be
shown every before and after.

## requirements

# Requirements extracted from the canvas

Each item cites `source.dc.html` by line (`L123`) or by method of the canvas's `Component`
class. Portuguese UI strings are verbatim. **Inferred** marks behaviour the prototype only
implies. **Mock defect** marks prototype behaviour a build must not copy. Items the canvas
leaves undecided are in `open-questions.md`; nothing here is a product decision.

## A. The evaluation record

### AV-001 — An evaluation is one record holding several ratings
`seedRecords()` L497–508; `upsertRating()` L540–549. Shape:
`{ id, studentId, studentName, date, classLabel|null, values: {competencyId: 1..5}, comment, shared }`.
One record groups every competency rated for one player on one occasion, with one note.

### AV-002 — Record identity: player + class-or-none + calendar day
`findRecord()` L535–538. The first rating (or note) of the day for a player in a given class
creates the record; later input the same day merges into it. A different class, or no class,
is a different record. The next day starts a new record. The mock uses the browser's local day.

### AV-003 — Ratings are whole stars, 1 to 5, for every competency
`starsFor()` L571–578. No per-competency scale, no halves, no zero. The evolution chart's
y-axis is fixed to 1–5 (L714). Filled stars use `--status-progress-solid`.

### AV-004 — Tap to save
`upsertRating()` L540–549, `updateComment()` L551–560. A star tap or a note keystroke writes
immediately. No save button, no dirty state. "Concluir avaliação" (L290) only closes the form
(`onCloseNewEval`, L791).

### AV-005 — Only what the coach rated is stored
L545–546. An untouched competency writes nothing; the record's `values` holds only tapped
competencies. Evaluation is optional and partial (L153: "a avaliação continua opcional").

### AV-006 — A rating cannot be cleared
`starsFor()` L571–578: values 1–5 only; tapping the lit star re-saves it. There is no reset and
no way back to unrated. (Open question Q8.)

### AV-007 — One private note per record
"Nota privada (opcional)" L243, L289; `updateComment()` L551–560. The note belongs to the record,
not to a competency. A note with no rating still creates a record (`values: {}`, L556).

### AV-008 — Optional class link
`classLabel` L500–506, L545. Records made from a class carry the class; records made from the
player drawer carry `null` (L698–700). History shows "· Aula 5" only when linked (L332).

## B. Evaluating from a class

### AV-010 — "Avaliações" is a primary action on the class detail
L203–208. Footer order: "Editar", "Notificar", "Lembrar", "Avaliações" (primary). The other three
have no handler in the canvas (inert chrome).

### AV-011 — The class drawer swaps to "Avaliações — {aula}"
L211–216, L783–785. "←" returns to the class detail; "×" and the scrim close the drawer and
collapse the accordion.

### AV-012 — Participant accordion, one open at a time
L221–246; `expandedStudent` is a single id (L626). Row: avatar, name, summary, "+" rotated 45°
when open (L227, L624).

### AV-013 — Row summary
`buildStudentRows()` L621–625. "Sem avaliação" when no *active* competency is rated today in this
class; otherwise "`N`/`M` avaliadas" with `M` = active competencies, `N` = those with a value.

### AV-014 — Expanded row
L229–245. One line per **active** competency (label + five stars), then "Nota privada (opcional)".

### AV-015 — "Gerir competências" is reachable from the evaluation panel, twice
Eyebrow action L218 and ghost button "+ Gerir competências" L250. In the canvas it is reachable
from nowhere else (not the player drawer, not Definições).

## C. Competencies

### AV-020 — Built-in catalogue of 17, in three groups
`COMPETENCIAS` L463–481.
- **Geral:** Técnica, Tática, Consistência
- **Técnica:** Direita, Esquerda, Volley, Bandeja, Víbora, Smash, Saída de vidro, Duplo vidro, Serviço
- **Tática:** Posição defensiva, Posição atacante, Transição, Tomada de decisão, Jogo em dupla

"Técnica" and "Tática" are each both a group and a competency inside "Geral".

### AV-021 — Three active by default
`DEFAULT_ACTIVE` L482: Técnica, Tática, Consistência (the "Geral" group).

### AV-022 — Competencies are switched on and off, never deleted
`toggleCompetency()` L562; modal L363–391. Groups shown in the order Geral, Técnica, Tática,
Personalizada (L682); empty groups hidden (L689). No rename, no delete in the canvas.

### AV-023 — Switching off keeps history
Entry forms list active competencies only (L627, L700); history lists every value in the record
(L730); evolution pills list every competency the player has data for (L703–707).

### AV-024 — Custom competency
L378–386; `addCustomCompetency()` L564–569. "Competência personalizada" → "Nome da competência"
+ "Adicionar". Trimmed; empty ignored; created active, in group "Personalizada". **Mock defect:**
no duplicate-name check.

### AV-025 — Changes apply forward
L387: "As alterações aplicam-se imediatamente às próximas avaliações." Close button "Concluído".

### AV-026 — One competency set per coach
A single `competencies` state (L526) drives the class panel and the player drawer alike.
**Inferred:** the set is the coach's, not per class or per player.

## D. The player's evaluations

### AV-030 — Profile card "Avaliação"
L108–116. "Última avaliação em {d Mmm aaaa}." (`fmtShort()` L531) or "Ainda não há avaliações."

### AV-031 — "Avaliações" primary button on the player profile
L103 → drawer "Avaliações — {nome}" (L258–264), 520 px, sections "Evolução" and "Histórico".

### AV-032 — "Nova avaliação" outside a class
L270–292. Secondary button, hidden while the form is open. Form: active competencies with
stars, "Nota privada (opcional)", "Concluir avaliação". Record has no class (L698–700). Tapping
nothing creates nothing.

### AV-033 — Evolution per competency
L294–317. Filter pills, one per competency with data for this player (L703–707); a line chart
of **monthly averages**, each the mean of that calendar month's ratings rounded to one decimal
(`seriesFor()` L580–591); month labels "Jan"… (no year).

### AV-034 — Three rolling means
`periodAverage()` L593–600; labels L309–311: "Média mensal", "Média semestral", "Média anual" —
mean of raw ratings in the last 1 / 6 / 12 months, one decimal, "—" when none.

### AV-035 — Delta since the first month
L716–719: with two or more monthly points, "↑ +1.5 desde Jan" or "↓ -0.5 desde Jan" — last
monthly mean minus the first ever. **Mock defects:** always green (L314); zero prints "↑ +0".

### AV-036 — Evolution empty state
L318–320: "Ainda sem avaliações registadas para consultar evolução." **Mock defect:** the
selected competency defaults to `bandeja` (L521), is not reset on player change, and the pills
sit inside the has-data card, so a player with data but no Bandeja sees the empty state with no
way to switch. A build defaults to the first competency that has data.

### AV-037 — History
L323–356; L723–734. Newest first. Card: date "· class", then "Partilhar avaliação" or
"✓ Partilhada com o aluno em {data}", then each rated competency with read-only stars, then the
note in italics and quotes. Empty: "Ainda sem avaliações." No edit or delete of a past record.

## E. Sharing with the player

### AV-040 — Evaluations are not visible to the player until shared
`shared: null` on every new record (L545, L556); the note is labelled private. **Inferred**
from the existence of the share flow; the canvas never shows the player's side.

### AV-041 — Step 1: choose what to show
L397–422; `openShare()` L602. Title "Escolhe o que queres mostrar a {primeiro nome}". A checkbox
per competency in the record ("Bandeja — 4/5"), all pre-selected. "Evolução" pills (L753):
"Desde a última avaliação" (default), "Últimos 6 meses", "Último ano", "Não mostrar evolução".
Only if the record has a note: "Incluir comentário do treinador", **off by default**.
Button "Pré-visualizar".

### AV-042 — Step 2: preview
L424–450. Dark card: "Evolução de {nome}", "Avaliação — {mês} {ano}" (L758), stars for the chosen
competencies, evolution line "Bandeja ↑ +1.5", the note if included. "Voltar" / "Partilhar".
**Mock defects:** the evolution line covers only the first selected competency and ignores the
chosen period (L763–772); nothing blocks sharing zero competencies.

### AV-043 — Sharing stores what was shared
`confirmShare()` L609–614: `shared = { at, competencyIds, evoOption, includeComment }`. The card
then reads "✓ Partilhada com o aluno em {data}". No un-share, no re-share.

## F. Reminder setting

### AV-050 — "Frequência de avaliações"
L142–154; L736. Options "Nunca", "Mensalmente" (default, L524), "A cada 2 aulas", "A cada 4 aulas",
"Personalizado" → number field, suffix "aulas", hint "A cada quantas aulas queres ser lembrado",
default 4 (L525). Caption: "O lembrete só ajuda a manter o histórico atualizado — a avaliação
continua opcional." The canvas stores the choice and never uses it.

## G. Shell ideas outside the evaluation system

### AV-060 — Dark mode switch
"Modo escuro" toggle under "Aparência" (L137–140) and a "Claro"/"Escuro" control in the nav
(L44, L779), one shared state.

## I. Edge states and mock defects found in the script

Observations a build has to handle; none is a proposal.

### AV-070 — The class summary ignores ratings under switched-off competencies
L621 vs L506, L482. The seeded record for João in "Aula 5" rates three competencies that are not
active by default, so his row reads "Sem avaliação" although today's record exists; the expanded
row shows empty stars and the note **pre-filled** from that record (L628).

### AV-071 — Every competency can be switched off
`toggleCompetency()` L562 has no guard. With none active, an expanded row and "Nova avaliação" are
note-only and the summary still reads "Sem avaliação".

### AV-072 — No cancel in either modal
"Gerir competências" closes by "Concluído" or the scrim, with every toggle already applied (L364,
L388). The share modal closes only by the scrim or "Partilhar" (L394).

### AV-073 — Two history cards for one date
A class record and a class-less record of the same day are distinct (L619 vs L698–700).

### AV-074 — Chart and figures
Bare chart: polyline, r=4 dots, month labels; no axes, grid, value labels or hover (L301–307). A
single monthly point draws one dot and no delta (L713, L716). Monthly points and deltas round with
`Math.round(x*10)/10` ("3", "+1"); period means use `.toFixed(1)` ("4.0") (L590, L599, L717). The
period cutoff is *now* including time of day, shifted by `setMonth` (L594–595).

### AV-075 — Share selection order is mutable
The selection is a `Set` (L602): re-ticking a competency moves it last, changing which one drives
the single evolution line (L759, L764).

### AV-076 — `shared.at` is a display string
`confirmShare()` stores `fmtShort(today)` — "21 Set 2026" — not an instant (L611).

### AV-077 — Overlays survive a view change; the form survives a drawer close
View change resets only `selectedClass` (L653) while the player drawer and both modals render
outside the view conditionals (L258, L363, L393). Closing the drawer leaves `newEvalOpen` set (L790).

### AV-078 — Unbounded note, client-minted ids, hand-rolled dates, slug mangling
Note field has no limit (L243, L289). Record ids are `'r' + Date.now() + Math.random()` (L545).
Dates come from the canvas's own Portuguese tables (L459–461). Custom-competency slugs drop
accented characters (L567).

### AV-079 — Mock inconsistencies
"12/16" with three participants (L678 vs L484–488); "N3" on the tile vs "Nível 3" in the detail
(L674, L678); nav key `comunicacao` for the label "Mensagens" (L646).

## H. Declared out of scope by the canvas

### AV-090 — "Fora do âmbito"
- Views Painel, Treino, Mensagens (L51–56, L668): "Este ecrã não faz parte do sistema de
  avaliações — não foi construído nesta demonstração."
- Profile cards "Informação" (L117–120) and "Pontos fortes e fracos" (L123–127): "Fora do âmbito
  desta funcionalidade."
- Inert chrome: disabled "Ver presenças", "Ver faltas", "Adicionar a aulas", "Lista de espera",
  "Desassociar" (L99–104); handler-less "Editar" (L95, L204), "Notificar", "Lembrar" (L205–206);
  "Aula 8" (L675).
- Live chrome with no effect: the reminder pills and custom field change state that nothing reads
  (L134–156, L737). The setting is proposed (AV-050); reminder behaviour is not in the canvas.

## screens

# Screens and states in the canvas

Desktop coach web app only. No phone layout, no player-side screen, Portuguese only. `L` = line
of `source.dc.html`. Requirement ids refer to `requirements.md`.

| # | Screen / state | Lines | Shown when | Requirements |
|---|---|---|---|---|
| S1 | Shell: 220 px nav (Painel, Calendário, Jogadores, Treino, Mensagens, Definições) + theme control "Claro"/"Escuro" | L28–46, L641–663 | always | AV-060 |
| S2 | Out-of-scope placeholder: badge "Fora do âmbito" | L51–56 | view = Painel, Treino, Mensagens | AV-090 |
| S3 | Calendário: title, today's date, two class blocks, hint "Toca na Aula 5 para abrir os detalhes." | L58–71, L671–676 | default view | scaffolding |
| S4 | Class drawer — detail: Hora, Capacidade, Nível, Campo; "Participantes (12/16)"; footer Editar · Notificar · Lembrar · **Avaliações** | L161–209 | a class is selected | AV-010 |
| S5 | Class drawer — "Avaliações — Aula 5": header action "Gerir competências", participant accordion, "+ Gerir competências" | L211–252 | "Avaliações" pressed in S4 | AV-011–AV-015 |
| S5a | Participant row collapsed: "Sem avaliação" or "N/M avaliadas" | L223–228, L625 | — | AV-013 |
| S5b | Participant row expanded: star lines for active competencies + "Nota privada (opcional)" | L229–245 | row tapped; one at a time | AV-012, AV-014, AV-003–AV-007 |
| S6 | Modal "Gerir competências": groups Geral / Técnica / Tática / Personalizada, checkboxes, "Competência personalizada" + "Adicionar", caption, "Concluído" | L363–391 | from S5 only | AV-020–AV-026 |
| S7 | Jogadores: player list + profile card (badges "Nível 4-", "Direita"; action row; cards "Avaliação", "Informação", "Pontos fortes e fracos") | L73–132 | view = Jogadores | AV-030, AV-031, AV-090 |
| S7a | Card "Avaliação" with history: "Última avaliação em 21 Set 2026." | L110–112 | player has records | AV-030 |
| S7b | Card "Avaliação" empty: "Ainda não há avaliações." | L113–115 | no records | AV-030 |
| S8 | Player drawer "Avaliações — {nome}": sections "Evolução" and "Histórico" | L258–361 | "Avaliações" pressed in S7 | AV-031 |
| S8a | "Nova avaliação" form: star lines, "Nota privada (opcional)", "Concluir avaliação" | L275–292 | "Nova avaliação" pressed | AV-032 |
| S8b | Evolution card: competency pills, monthly-average line chart, "Média mensal / semestral / anual", delta "↑ +1.5 desde Jan" | L294–317 | selected competency has data | AV-033–AV-035 |
| S8c | Evolution empty: "Ainda sem avaliações registadas para consultar evolução." | L318–320 | no data for the selected competency | AV-036 |
| S8d | History card, not shared: date · class, "Partilhar avaliação", read-only stars, note | L329–354 | record.shared = null | AV-037 |
| S8e | History card, shared: "✓ Partilhada com o aluno em {data}" | L333–335, L731 | record.shared set | AV-043 |
| S8f | History empty: "Ainda sem avaliações." | L325–327 | no records | AV-037 |
| S9 | Share modal step 1: "Escolhe o que queres mostrar a {nome}", competency checkboxes "Bandeja — 4/5", "Evolução" pills ×4, "Incluir comentário do treinador", "Pré-visualizar" | L397–422 | "Partilhar avaliação" pressed | AV-041 |
| S10 | Share modal step 2: "Pré-visualização", dark card "Evolução de {nome}" / "Avaliação — {mês ano}", "Voltar" / "Partilhar" | L424–450 | "Pré-visualizar" pressed | AV-042 |
| S11 | Definições: "Aparência" → "Modo escuro"; "Avaliações" → "Frequência de avaliações" pills ×5, custom "aulas" field, caption | L134–156 | view = Definições | AV-050, AV-060 |

## Navigation

```
Calendário ─ tap Aula 5 → S4 ─ "Avaliações" → S5 ─ "Gerir competências" → S6
                          S5 ─ "←" → S4        S4/S5 ─ "×" or scrim → Calendário
Jogadores  ─ select player → S7 ─ "Avaliações" → S8 ─ "Nova avaliação" → S8a
                                   S8d ─ "Partilhar avaliação" → S9 ─ "Pré-visualizar" → S10
                                   S10 ─ "Voltar" → S9      S10 ─ "Partilhar" → S8e
Definições → S11
```

## Drawers and modals

- Drawers slide from the right over a scrim `rgba(11,21,36,0.45)`: class 460 px, player 520 px,
  both `max-width: 92vw` (L162–163, L259–260). Clicking the scrim closes.
- Modals are centred, 480 px, `max-height: 86vh`, above the drawers (z-index 50 vs 40; L364–365,
  L394–395), so "Gerir competências" opens over the class drawer and the share modal over the
  player drawer.

## Mock data

Players (L489–495): João Silva 4- Direita; Pedro Costa 3 Esquerda; Miguel Santos 5 Direita;
Adriano Lopes 4 Direita; Filipa Cruz 3 Direita. Aula 5 participants (L484–488): João Silva,
Pedro Costa, Miguel Santos. Seed records (L497–508): seven for João Silva — Bandeja 2, 3 (Jan),
3, 3 (Mar), 3, 4 with Posição atacante 3, 3 (Jun), and today's in "Aula 5": Bandeja 4, Posição
atacante 4, Tomada de decisão 3, note "Continua a trabalhar a tomada de decisão no ataque."

## tokens

# Design-system usage in the canvas

The canvas imports `_ds/levelup-design-system-fec52606-4a04-47e9-ad19-0cdf6c22707c/` (tokens
`fonts`, `colors`, `typography`, `spacing`, `elevation`, `motion`, `dark`, `styles.css`,
`_ds_bundle.js`; L11–19). The bundle was **not on disk** at ingestion, so token *values* and
component internals are unknown here; only names and usage are recorded.

## Components (`LevelUpDesignSystem_fec526.*`)

| Component | Used for | Lines |
|---|---|---|
| `Icon` | nav icons `painel`, `calendario`, `jogadores`, `treino`, `mensagens`, `definicoes` | L37, L642–647 |
| `SegmentedControl` | theme "Claro"/"Escuro" | L44 |
| `Card` (default, `tone="sunken"`, `tone="inverse"`) | profile, summary cards, new-evaluation form (sunken), share preview (inverse) | L52, L85, L108, L276, L295, L330, L426 |
| `Badge` (`tone="progress"`, `"neutral"`, `size="sm"`) | "Fora do âmbito", "Nível 4-", hand | L53, L91–92 |
| `ClassBlock` | calendar class tile (title, time, court, level, filled, capacity, status `now`/`scheduled`) | L66 |
| `PlayerRow` | player list row (name, level, hand) | L79 |
| `Avatar` (`size` sm/md/xl, `tone="accent"`) | participants, profile | L87, L195, L224 |
| `Button` (`variant` primary/secondary/ghost/danger; `size` sm/md/lg; `fullWidth`; `disabled`) | every action | throughout |
| `Eyebrow` (optional `action` + `onAction`) | section headers; "Avaliações" carries the inline action "Gerir competências" | L137, L191, L218, L269, L324, L369, L379, L408 |
| `FilterPill` (`active`) | reminder frequency, evolution competency, share evolution period | L147, L298, L411 |
| `Input` (`multiline`, `type="number"`, `suffix`, `hint`, `placeholder`) | private note, custom competency, custom reminder | L151, L243, L289, L382 |
| `Toggle` | "Modo escuro" | L139 |

Stars, checkboxes, the accordion "+" and the line chart are **hand-built** in the canvas (inline
SVG / spans), not design-system components (L237, L372, L227, L301–307).

## Semantic tokens carrying meaning

| Token / literal | Meaning in the canvas | Lines |
|---|---|---|
| `--status-progress-solid` | filled star (fill and stroke); chart line and dots | L575–576, L302–304 |
| `--surface-card` + `--border-default` | empty star | L575–576 |
| `--status-done-solid` | evolution delta text (used even when negative — mock defect) | L314 |
| `#5FD3AC` | evolution text on the dark preview card | L440 |
| `--text-on-navy-muted`, `#fff` | labels and text on the `inverse` card | L427–443 |
| `--action-primary` | checked checkbox fill, active nav text, selected-row bar | L687, L659, L693 |
| `--surface-accent`, `--surface-accent-soft` | active nav item, selected player row | L658, L693 |
| `rgba(11,21,36,0.45)` | scrim behind drawers and modals | L162, L259, L364, L394 |
| `--transition-control` | accordion "+" rotation | L227 |

Type styles used: `--text-display-lg`, `--text-display-sm`, `--text-title`, `--text-body`,
`--text-body-strong`, `--text-caption`; fonts `--font-display`, `--font-body`;
`--tracking-display`. Spacing `--space-1`…`--space-6`; radii `--radius-sm`, `--radius-md`,
`--radius-2xl`; elevation `--shadow-lg`; `--control-height-md`. Theme via `data-theme` on the
root (L28).

## Sizes that matter

Stars 20 px in entry forms (L237, L283), 16 px read-only (L345, L434). Chart viewBox 480×140,
padding 24, y mapped from 1–5 (L712–714). Competency label column 130 px in the class panel,
150 px elsewhere (L233, L279, L342).

<!-- 3.x fields of archive/documents/sistema-de-avaliacoes-2026-09-21, carried verbatim by cortex migrate -->
```yaml
kind: design-canvas
version: "2026-09-21"
status: active
source_filename: "Sistema de Avaliações.dc.html"
origin: "Claude Design canvas handed over by the product owner on 2026-09-21 as the new evaluation system and evaluation style — an interactive desktop prototype of the coach's web app (per-class evaluation panel, 1–5 star ratings saved on tap, a grouped padel competency catalogue, per-player evolution and history, a two-step \"Partilhar avaliação\" flow, and a reminder-frequency setting). Most behaviour lives in the script, not the markup. sha256 a8a1f102340f33a84b84ebc58f43e9989dbc8c7eb1dd4defec21b9b16b0eb788. The design-system bundle it imports was not on disk, so it was read, not rendered."
```
