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
