---
id: notifications.message-templates
status: implementing
depends_on: [notifications.config]
serves: [P-NOTIFICATIONS-3]
governed_by: []
---

# notifications.message-templates


### Intent
Customize the text of notification messages sent to players.

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; swap
plan §6.4) the items in the table are replaced and the readings below
hold; the rest hold unchanged. Not marked inline: this section is the one place. When every coach is
drained, the old engine is deleted and the replaced items go with it.

| Item | For a new-engine session | Source |
|---|---|---|
| Rule 15 (no `spot_filled` message) | a fill retires nothing (D4); a Yes into a full session gets const:KIND_SORRY with the waiting-list offer (never another offer: the owner, 2026-11-12) | `notifications.engine-answers` rules 3, 4 |
| Rule 16 (`{side}` only in `waiting_list_invite`) | any invitation names a side only when it is outside the student's subset | `notifications.engine-planning` rule 9 |
| Criterion 14 | replaced with rule 15 | — |

Readings:
- Rule 2: templates are needed for const:KIND_ADDED, const:KIND_SIDE_MOVED and the coach alert (const:ALERT_NO_CANDIDATE); const:KIND_WAITING_LIST_INVITE uses today's `waiting_list_invite`, and const:KIND_SORRY today's `waiting_list_offer` ("spot taken, join the list?", the same message), so a coach's own text for either carries over (`notifications.engine-answers` rule 11).
- Rule 3 and criteria 5, 7: the engine's attendance requests render through today's `reminder` templates (`notifications.engine-timeline` rule 2: the recipients change, not the message).
- Criteria 6, 8, 9: a new-engine invitation renders through `invite`, or `waiting_list_invite` from a waiting list.

The new-engine templates (swap step 8, PAD-920). **The default texts below are proposals awaiting the
owner's approval (Open questions); the keys, placeholders and editor places are not.**
- **N1. Three new keys**, in both default dicts (`DEFAULT_MESSAGE_TEMPLATES`, `_PT`), and the two
  editable ones in the `MessageTemplates` type (`coach_no_candidate` stays out, as the other
  non-editable keys do). Each key's name is its kind's, except `waiting_list_added`
  (`notifications.engine-answers` rule 11):

  | Key | Sent for | Proposed en | Proposed pt |
  |---|---|---|---|
  | `waiting_list_added` | const:KIND_ADDED | `Hi {name}, a spot opened in the class on {weekday} at {time} and you were on the waiting list, so you're in{side}. If you can't make it, let me know. 🎾` | `Olá {name}, abriu uma vaga na aula de {weekday} às {time} e estavas na lista de espera, por isso já estás inscrito{side}. Se não puderes ir, avisa. 🎾` |
  | `side_moved` | const:KIND_SIDE_MOVED | `Hi {name}, in the class on {weekday} at {time} you'll play on the {sideName} side. See you there!` | `Olá {name}, na aula de {weekday} às {time} vais jogar do lado {sideName}. Até já!` |
  | `coach_no_candidate` | the coach alert, const:ALERT_NO_CANDIDATE | `{class} on {weekday} at {time}: {count} open spot(s){side} and nobody left to invite automatically.` | `{class} na {weekday} às {time}: {count} vaga(s) por preencher{side} e já não há ninguém para convidar automaticamente.` |

  `waiting_list_added` is not named `added`: a key `added` would read as today's `added_to_class`, which
  means another message (`notifications.engine-answers` rule 11's invariant). `waiting_list_placed` is not reused: a stored
  `waiting_list_placed` text is ignored since PAD-446 (rule 2).
- **N2. Two new placeholders.** `{sideName}` is the bare side word ("left" / "esquerdo", "right" /
  "direito"), filled for `side_moved` only; `{count}` is the alert's uncovered spots, filled for
  `coach_no_candidate` only. Both are stripped to "" anywhere else, as `{side}` is (rule 16's mechanism).
  `{side}` keeps its phrase (" (left side)" / " (lado esquerdo)") and is filled for
  `waiting_list_added` and `coach_no_candidate` when the offer or the spot type has a side
  (`notifications.engine-planning` rule 9 decides when an invitation names one).
- **N3. The web editor.** `waiting_list_added`
  joins "Lista de espera" / "Waiting list" after `waiting_list_invite`; `side_moved` joins "Adicionado a
  uma aula" / "Added to a class". `coach_no_candidate` is not editable: it is a message to the coach
  themselves. Labels and descriptions (`settings.templates.labels.*`,
  `.descriptions.*`, both locales): `waiting_list_added` "Entrada automática da lista de espera" / "Placed from the waiting
  list", "Enviada quando a entrada automática põe um aluno da lista de espera numa vaga." / "Sent when
  automatic entry places a waiting-list student in a spot."; `side_moved` "Lado definido" / "Side set",
  "Enviada quando um aluno que joga dos dois lados fica com o lado final." / "Sent when a student who
  plays both sides is given their final side.". `waiting_list_offer`'s description becomes "Enviada
  quando um aluno diz que sim a uma vaga que já foi ocupada, oferecendo a lista de espera." / "Sent when
  a student says yes to a spot that was already taken, offering the waiting list." (it is now
  const:KIND_SORRY's text, `notifications.engine-answers` rule 11). iOS has no editor (Notes).
- **N4. Rules 5, 8, 9 hold for the new keys**: fully substituted, a blank stored text falls back to the
  default, nothing blank is sent.

### Rules
1. Templates stored in `notification_configs.message_templates` JSON
2. Template keys: invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_invite. (PAD-446: `waiting_list_invite` replaces `waiting_list_placed`; a stored `waiting_list_placed` text is ignored.) Since PAD-501, `spot_filled` is sent only to a student whose pending join request was closed because the class filled (`classes.join-requests` rule 10); see rule 15
3. Templates support placeholders (player name, class name, date, time). The templates that describe a class (invite, reminder, reminder_followup, waiting_list_invite, class_cancelled) accept `{name}`, `{level}`, `{weekday}`, `{time}` and, since PAD-430, `{type}`, `{date}` and `{court}` (rules 12–14) and, since PAD-836, `{duration}` and `{club}` (rules 21, 22); the web settings editor lists all seven beside each of the four editable ones. The two `added_to_class` templates (`classes.instance-enrollment` rule 11, PAD-330) accept the same seven plus `{class}` (the class title) and `{when}` (rule 17)
4. Updated via `POST /api/app/notify/config`
5. Placeholders must render fully substituted with concrete values — a rendered message never contains a raw placeholder token (`{level}`, `{weekday}`, etc.) or a filler artifact such as the literal word "this" in a placeholder slot
6. The `{weekday}`, date, and time placeholders render in the **recipient coach's locale** (see settings.language), formatted via Flask-Babel — e.g. `pt` → "quarta-feira", `en` → "Wednesday". Never manually string-built from English day/month names. Fallback locale is Portuguese
7. When a class instance has no assigned level, the `{level}` phrase disappears whole: the placeholder renders an empty string (no filler word) **and the genitive connector directly before it goes with it** — `de`, `da`, `do` in Portuguese, `of` in English — so "aula de {level} esta {weekday}" reads "aula esta quarta-feira" and "aula de {level} de {weekday}" reads "aula de quarta-feira". An empty string alone is not enough: a coach's own text often puts `{level}` after "de" — every Portuguese default did until PAD-830 (rule 20), and a coach who saved those texts still has them (PAD-346, B-098). Any other word before the placeholder is left as the coach wrote it; the formatter then collapses doubled spaces and space-before-punctuation
8. Every template key always resolves to non-empty text. A stored template that is missing, `null`, not a string, or blank/whitespace-only falls back to the built-in default for the resolved locale (`DEFAULT_MESSAGE_TEMPLATES_PT` for `pt`, `DEFAULT_MESSAGE_TEMPLATES` for `en`). This applies to **every** template key, not just the reminder ones
9. The system never sends a message whose rendered body is empty or whitespace-only. If, after placeholder substitution and the rule-8 fallback, the text is still blank, the message is not sent at all
10. The fallback is resolution-time only: the stored JSON is never rewritten, so a blank the coach saved stays blank in `notification_configs.message_templates`. Every *read* resolves it — `GET /api/app/notify/config` returns the resolved (non-blank) templates, so the settings UI never presents an empty textarea for an un-customized key
11. Template defaults are resolved in the coach's own locale on every path, including the reminder-response, cancellation, invitation-response and waiting-list paths (which previously fell back to the English defaults regardless of `settings.language`)
12. `{type}` renders the class's type (`lessons.type`) as one word in the **coach's** locale, like every other placeholder (rule 6): `academy` → "academia" / "academy", `private` → "privada" / "private". The coach writes the template in one language, so the type word follows the template's language, not the recipient's (PAD-430 decision; the ticket's "recipient language" is met for every recipient who shares the coach's language, which is the only case a single-language template can serve)
13. `{date}` renders the class's start date as `dd/mm` (zero-padded day and month, no year, e.g. "23/02"), from the same wall-clock start the `{weekday}` and `{time}` placeholders use; it is locale-independent
14. `{court}` renders the name of the class's court (`lessons.court`, clubs.courts rule 6; for an occurrence, its own court first, clubs.courts rule 9, PAD-513) and is empty when the class has no court. An empty `{court}` leaves no broken text: the placeholder renders empty and the connector directly before it goes with it — rule 7's genitives plus the locative prepositions `em`, `no`, `na`, `in`, `on`, `at` — then an empty pair of brackets, `()` or `[]`, is removed and rule 7's space/punctuation collapse runs; a message the empty placeholder left starting on punctuation ("No {court}, às {time}.") loses it and its first letter is capitalised ("Às 19:00."). A template the coach opened on punctuation ("- Lembrete: …") keeps it as written. So "aula às {time} no {court}." reads "aula às 19:00." and "aula ({court})" reads "aula". Any other word before it is left as the coach wrote it. None of the built-in defaults use `{type}`, `{date}` or `{court}`; they are opt-in for the coach
15. **No message for an invitation or spot outcome the student already sees (PAD-501; owner: "no message when an invitation expires or the spot is filled").** The `spot_filled` text is not sent:
    - to the other candidates when someone else takes the spot: their invitation shows "Vaga preenchida" (`notifications.invitations` rule 15);
    - to a student whose "yes" arrived after the spot went: the answer reports `spot_filled` / `spot_filled_waiting_list_offered`, both shells show it, and the bubble records it and offers the waiting list; no offer message is sent (PAD-621);
    - to a student whose come-back is refused because the class is full (`attendance.confirm` rule 26): the screen that sent it shows the refusal.
    It is still sent when a pending join request is closed because the class filled (`classes.join-requests` rule 10): the request card's "superseded" is a passive signal and the requester gets nothing else. The web settings editor describes the template that way. iOS has no template settings.
16. `{side}` (PAD-446; numbering unconfirmed) is filled only in `waiting_list_invite`: when the
    vacancy's side is `left` or `right` it renders ` (left side)` / ` (right side)` in the coach's
    locale (pt ` (lado esquerdo)` / ` (lado direito)`), leading space and brackets included; for a
    `both` or empty side it renders as nothing. The default texts put it right after the time, so a
    spot without a side reads as an ordinary sentence. In any other template `{side}` renders as
    nothing.
3a. **Every placeholder in every template (PAD-670; numbering unconfirmed).** Every template key
   of rule 2, plus `waiting_list_confirm`, `added_to_class`, `added_to_class_coming` and
   `class_cancelled`, is about one student and one class, and each is rendered through
   `_format_template` with the same set of values: `{name}`, `{level}`, `{weekday}`, `{time}`,
   `{day}`, `{type}`, `{date}`, `{court}`, `{duration}`, `{club}`, `{class}` and `{when}` (`{duration}` and
   `{club}` since PAD-836). One helper builds that set for
   a student and a class (`template_variables`), so a placeholder the coach types into ANY field
   is replaced when the message is sent — before PAD-670, `confirm`, `decline`, `spot_filled`,
   `reminder_confirmed`, `reminder_declined`, `waiting_list_offer` and `waiting_list_confirm`
   were sent raw and a `{day}` typed there reached the student as `{day}`. `{side}` stays filled
   only in `waiting_list_invite` (rule 16) and renders as nothing elsewhere. The web editor
   offers the insert-placeholder badges and the live preview (rule 19) under every field it
   edits. Rules 5, 7 and 14 (no raw token, empty phrases disappear with their connector) apply to
   every template. A send site whose class is unknown (none today) would pass empty values, which
   rule 7 already renders cleanly. iOS has no template editor (Notes): the rendering is server
   side and reaches every recipient.
17. **The class-when suffix names the day (PAD-519; numbering unconfirmed).** One formatter
    (`_format_when`) writes the " on <day> at <time>" phrase that the system's own, non-editable
    notices append to a class title — the coach's "entrou na lista de espera de …" notice
    (`classes.academy-class-booking` rule 6), the join-request notices to the coach and the
    student (`classes.join-requests` rule 15), the late-cancel and late-return notices to the
    coach — and that fills `{when}` in the two `added_to_class` templates. For an **occurrence**
    it carries the day of the month in rule 13's `dd/mm` form, then the weekday in brackets, then
    the time: pt ` no dia 10/04 (sábado) às 18:00`, en ` on 10/04 (Saturday) at 18:00`. "dia" is
    masculine, so Portuguese no longer switches `na`/`no` on the weekday. For a **series** (a
    Lesson, whose start is only its first occurrence — `added_to_class` on a coach's add to the
    whole class) the phrase stays weekday-only, ` na segunda-feira às 10:00` / ` on Monday at
    10:00`: a recurring enrolment must not be dated. The weekday follows rule 6 (Babel, the
    coach's locale); with no start the phrase is empty, and with a start whose weekday Babel
    cannot name it is ` no dia 10/04 às 18:00` / ` on 10/04 at 18:00`. The
    coach-editable templates are untouched: `{date}` stays opt-in there (rule 14), and the
    built-in defaults still read weekday-only unless the owner decides otherwise.
    **Weekday-first form (PAD-678; numbering unconfirmed).** One notice puts the weekday before the
    date: the student's "Está marcado!" on an accepted join request (`classes.join-requests`
    rule 19). The same formatter writes it: pt ` na sexta-feira, 16/10, às 09:00` (`no` for
    sábado/domingo, as for a series), en ` on Friday, 16/10, at 09:00`. Every other notice keeps the
    ` no dia 10/04 (sábado) às 18:00` form above.
18. **`{day}` says the class's day naturally (PAD-549; numbering unconfirmed).** Accepted by every
    template that describes a class (rule 3). It is computed when the message is rendered — in the
    engine, the moment it is sent, so a message held by quiet hours past midnight is right — on the
    club's wall clock, in the coach's locale. **Only the next-week form carries a preposition in
    Portuguese** — "na próxima segunda-feira" / "no próximo domingo" (owner decision, PAD-561,
    B-463; it reversed PAD-549's "no preposition inside"); "hoje", "amanhã", "esta sexta-feira" and
    "dia 23/10" carry none. The field therefore fits sentences like "A aula é {day} às {time}" and
    "Lembrete: {day} às {time}"; "para {day}" reads "para na próxima…" for a next-week class, and
    the help (rule 19) says so. Weeks run Monday to Sunday:
    | The class is | pt | en |
    |---|---|---|
    | the same day | hoje | today |
    | the next day | amanhã | tomorrow |
    | two days on | depois de amanhã | the day after tomorrow |
    | later this week | esta sexta-feira / este sábado | this Friday |
    | any day next week | na próxima segunda-feira / no próximo domingo | next Monday |
    | later, or past | dia 23/02 | 23/02 |
    The four choices (name, no preposition, week boundary, send time) were the coordinator's, from
    the ticket's "to validate" table, and were relayed to the owner as information (2026-10-08).
    No built-in default uses `{day}`; it is opt-in like rule 14's.
19. **The editor explains templates and previews them (PAD-549; numbering unconfirmed).** The web
    settings editor opens with how a template is built (free text plus fields replaced when the
    message is sent) and a table of every field with what it means and an example, and shows a live
    preview under each class template. Examples and previews come from
    `POST /api/app/notify/template_preview` (coach only): the template rendered by the real
    formatter with example values for a sample class tomorrow at 18:00, plus each example — so the
    help cannot drift from what is sent. iOS has no template editor (Notes, PAD-430), so this is web
    only; `{day}` itself renders server-side and reaches every recipient.
20. **No default shows the student the class level (PAD-830; numbering unconfirmed).** The class
    level is the coach's own grading, so no built-in default, in either locale, contains `{level}`:
    `invite`, `reminder`, `reminder_followup`, `waiting_list_invite`, `class_cancelled`, and the
    new-engine `waiting_list_added` and `side_moved` (new-engine section N1) name the class by its
    day and time only. Each new text is the old one with the level phrase gone, as rule 7 already
    rendered it for a class with no level. `{level}` stays a supported placeholder (rules 3, 3a)
    and stays in the web editor's list: a coach who writes it into their own text still gets the
    level rendered. Stored texts are never rewritten (rule 10), so a coach whose saved templates
    hold an old default keeps it, `{level}` included.

21. **`{duration}` is the class's length in minutes (PAD-836; numbering unconfirmed).** It renders
    the whole number of minutes from the class's start to its end, then a space and the unit word:
    "60 min", "90 min", "75 min"; never hours ("1h30"). The times are the occurrence's own
    (`lesson_instances.start_datetime` / `end_datetime`) for a message about an occurrence, and the
    lesson's for a message about a whole series (an `added_to_class` on the series, rule 17). The
    unit word follows the coach's locale like every placeholder (rules 6, 12) and is `min` in both
    `pt` and `en`. A class with no end, or an end not after its start, renders `{duration}` empty,
    and rule 7's connector rule applies. Accepted by every template (rule 3a); no built-in default
    uses it.
22. **`{club}` is the name of the class's club (PAD-836; numbering unconfirmed).** It renders
    `lessons.club`'s name; an occurrence takes its lesson's club (an occurrence has no club of its
    own). The class's club is the only source: a coach at several clubs (PAD-835) changes nothing
    here. Empty, it behaves exactly like an empty `{court}` (rule 14): the placeholder renders
    empty, the connector directly before it goes with it (rule 7's genitives plus `em`, `no`,
    `na`, `in`, `on`, `at`), an empty pair of brackets is removed, and the space/punctuation
    collapse and leading-punctuation rule run. So "aula às {time} no {club}." reads
    "aula às 19:00." Accepted by every template (rule 3a); no built-in default uses it, and a coach's
    saved templates are not rewritten (rule 10).
23. **The editor offers both (PAD-836; numbering unconfirmed).** The web settings editor offers
    `{duration}` and `{club}` among the insert-placeholder badges under every field it edits (rule
    3a), and its help table (rule 19) lists them with their meaning, "Duração da aula" / "Class
    duration" and "Clube" / "Club", and the server's example from `template_preview_examples`
    (a sample class of 60 minutes, so "60 min", and a sample club name). Web only: iOS has no
    template editor (Notes; Open question Q1).

### Acceptance Criteria

#### NOTIFICATIONS-MESSAGE-TEMPLATES-1: A placeholder works in any template (rule 3a, PAD-670)
- **Given** a pt coach whose `reminder_confirmed` text is "Obrigado {name}, até {day} às {time} no {court}!"
  and a class tomorrow at 18:00 on court "Campo 2"
- **When** student Ana answers "Vou" to the reminder
- **Then** the confirmation she receives reads "Obrigado Ana, até amanhã às 18:00 no Campo 2!"
- **And** the same holds for `confirm`, `decline`, `spot_filled`, `reminder_declined`,
  `waiting_list_offer` and `waiting_list_confirm`: none sends a raw `{…}` token

#### NOTIFICATIONS-MESSAGE-TEMPLATES-2: The editor offers every placeholder in every field (rule 3a)
- **Given** a coach on Settings → Message templates (web)
- **When** they open the `reminder_declined` field
- **Then** the placeholder badges are there and inserting `{day}` shows a preview reading "amanhã"

#### NOTIFICATIONS-MESSAGE-TEMPLATES-3: `{day}` reads like a person would (rule 18)
- **Given** a Wednesday, 10:00 on the club clock
- **When** an invite for a class on Thursday renders `"Abriu uma vaga para {day} às {time}!"` for a pt coach
- **Then** it reads "Abriu uma vaga para amanhã às 18:00!"; a Saturday class reads "este sábado", the
  next Monday "na próxima segunda-feira" (and "A aula é {day}" reads "A aula é na próxima
  segunda-feira"), a class two weeks on "dia 19/10"
- **And** the same Thursday class rendered at 00:30 on Thursday reads "hoje"

#### NOTIFICATIONS-MESSAGE-TEMPLATES-4: The editor explains and previews (rule 19)
- **Given** a coach on Settings → Message templates (web)
- **When** the page opens and they type "vaga para {day}, {name}" into the invite template
- **Then** the help lists every field with its meaning and the server's example ({day} → "amanhã")
- **And** the preview under the invite reads "vaga para amanhã, Ana"

#### NOTIFICATIONS-MESSAGE-TEMPLATES-5: Declining a reminder with a blank template still sends the default confirmation
- **Given** a coach whose `message_templates` has `reminder_declined` saved as an empty string (or whitespace only), and an enrolled player with a pending reminder for an upcoming class
- **When** the player responds "no" (not coming)
- **Then** the automatic confirmation message sent back to the player is the built-in default for the coach's locale (e.g. pt → "Entendido, obrigado por avisares!")
- **And** no message with empty or whitespace-only text is ever created

#### NOTIFICATIONS-MESSAGE-TEMPLATES-6: Blank templates fall back for every message type
- **Given** a coach whose `message_templates` has *all* keys saved as empty strings
- **When** any template-driven automatic message is sent (invite, confirm, decline, spot_filled for a join request closed by a full class, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_confirm, waiting_list_invite)
- **Then** each message body is the built-in default for that key in the coach's locale, never blank

#### NOTIFICATIONS-MESSAGE-TEMPLATES-7: Weekday and level render in the coach locale with no artifacts
- **Given** a coach whose `language` is `pt` and whose reminder template is `"Olá {name}, tens aula de {level} esta {weekday} às {time}. Vens?"`, and a class instance on a Wednesday with no assigned level
- **When** a reminder is sent to an enrolled player
- **Then** the rendered message reads "esta quarta-feira" (Portuguese weekday, via Flask-Babel), not "esta Wednesday"
- **And** the `{level}` slot renders empty, so the message never contains the literal word "this"
- **And** the connector goes with it: the text reads "tens aula esta quarta-feira", never "aula de esta" (PAD-346)
- **And** no raw placeholder token remains in the delivered text

#### NOTIFICATIONS-MESSAGE-TEMPLATES-8: Class type, day/month and court render in a custom template
- **Given** a coach whose `language` is `pt`, whose invite template is `"Olá {name}, abriu uma vaga numa aula {type} no dia {date} às {time} no {court}."`, and a private class starting 2027-02-23 19:00 on court "Campo 2"
- **When** the engine invites a student named "Ana Silva"
- **Then** the message reads "Olá Ana, abriu uma vaga numa aula privada no dia 23/02 às 19:00 no Campo 2."
- **And** with an `en` coach and an academy class the `{type}` slot reads "academy"

#### NOTIFICATIONS-MESSAGE-TEMPLATES-9: A class without a court leaves no broken text
- **Given** the same template and an academy class with no court
- **When** the engine invites the student
- **Then** the message reads "Olá Ana, abriu uma vaga numa aula academia no dia 23/02 às 19:00." — no "no" left dangling and no space before the full stop
- **And** a template `"Aula {type} ({court})"` renders "Aula academia" with no empty brackets

#### NOTIFICATIONS-MESSAGE-TEMPLATES-10: The settings editor offers the new placeholders
- **Given** a coach on the web settings page, Message templates section
- **When** they open the invite, reminder, reminder follow-up or waiting-list invitation template
- **Then** the placeholder hints list `{type}`, `{date}` and `{court}` besides `{name}`, `{level}`, `{weekday}` and `{time}`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-11: A waiting-list join tells the coach the day, not only the weekday (rule 17, PAD-519)
- **Given** a `pt` coach Ana with a full academy class "Sábado 18h" occurring Saturday 2027-04-10 at 18:00, and an eligible student Carla Santos
- **When** Carla joins that occurrence's waiting list
- **Then** Ana's conversation with Carla gains the message "Carla Santos entrou na lista de espera de Sábado 18h no dia 10/04 (sábado) às 18:00."
- **And** with an `en` coach the text reads "Carla Santos joined the waiting list for Sábado 18h on 10/04 (Saturday) at 18:00."

#### NOTIFICATIONS-MESSAGE-TEMPLATES-12: A join request and its decision name the day the same way (rule 17)
- **Given** the same class and a pending join request from Carla
- **When** Ana refuses it
- **Then** Carla's message reads "Não ficaste inscrito/a em Sábado 18h no sábado, 10/04, às 18:00: o treinador não aceitou o pedido desta vez." (PAD-678: the weekday-first form, `classes.join-requests` rule 19a)

#### NOTIFICATIONS-MESSAGE-TEMPLATES-13: Adding a student to a whole series stays undated (rule 17)
- **Given** a `pt` coach whose `added_to_class` template is the default, and a weekly series "Segunda 10h" starting Monday 2027-04-12 10:00
- **When** the coach adds Carla to the series
- **Then** the message reads "Olá Carla, adicionei-te a Segunda 10h na segunda-feira às 10:00. Até já! 🎾" — no `dd/mm`
- **And** when the coach adds her to the single occurrence of 2027-04-19 instead, it reads "… adicionei-te a Segunda 10h no dia 19/04 (segunda-feira) às 10:00. …"

#### NOTIFICATIONS-MESSAGE-TEMPLATES-14: A spot going to someone else sends no "spot filled" message (rule 15, PAD-501)
- **Given** a coach whose `spot_filled` text is "Desculpa já não tenho vaga! Se abrir outra aviso-te", and a class with one open spot offered to students A and B
- **When** A takes the spot, B then answers "yes", and a third student's come-back to the now-full class is refused
- **Then** no chat message with that text is created for B or the third student
- **And** B's invitation shows "Vaga preenchida", B's "yes" is answered `spot_filled_waiting_list_offered` and no waiting-list offer message is sent (PAD-621), and the come-back is answered `spot_filled`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-15: A join request closed by a full class still gets the message (rule 15)
- **Given** the same coach and a pending join request from student C for that class
- **When** the class fills
- **Then** C's request is `superseded` and C receives the `spot_filled` text once

#### NOTIFICATIONS-MESSAGE-TEMPLATES-16: A stored text wins, anything missing or blank resolves to the coach's default, and nothing blank is sent (rules 2, 8, 9, 10)
- **Given** a coach who stored a text for one template and nothing, or only spaces, for the others
- **When** the templates are resolved
- **Then** the stored text is used for its key, and every other key, one added after the coach last saved included, resolves to the default in the coach's language; every message type has a default
- **And** the settings read answers the resolved texts, never a blank one, and leaves what is stored as it was
- **And** a stored value that is not a set of templates resolves to the defaults; a key with no default resolves to nothing; a key of the coach's own is kept
- **And** the reminder and its follow-up reach the student in the coach's own texts
- **And** a message whose text is blank is not created, while one with text is
test: `backend/padel_app/tests/test_pad330_the_student_is_told.py` › `test_a_coach_whose_templates_predate_the_key_still_gets_text` (+25 more)

#### NOTIFICATIONS-MESSAGE-TEMPLATES-17: The three new keys resolve in both locales, fully substituted (new-engine section N1, N2, N4)
- **Given** a coach with no stored texts, a `pt` and an `en` student, a {left, right} student told their side and a coach with a right spot nobody is left to invite for
- **When** `waiting_list_added`, `side_moved` and `coach_no_candidate` are rendered for a new-engine session
- **Then** each is the locale's default with no raw placeholder left, `{sideName}` reads "direito" / "right" in `side_moved`, `{count}` the uncovered count in `coach_no_candidate`, and `{sideName}` and `{count}` render "" in any other template
test: `backend/padel_app/tests/test_pad920_engine_templates.py` › `test_the_new_engine_keys_resolve_fully_in_both_locales`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-18: A coach's own text for a new key wins, and the sorry uses waiting_list_offer's (new-engine section N1, N4)
- **Given** a coach with a stored `waiting_list_added` text, a blank stored `side_moved` and a stored `waiting_list_offer`
- **When** the engine's `added`, `side_moved` and `sorry` messages are rendered
- **Then** `waiting_list_added` is the coach's text, `side_moved` the default, and `sorry` the coach's `waiting_list_offer` text
test: `backend/padel_app/tests/test_pad920_engine_templates.py` › `test_a_coachs_text_wins_and_sorry_uses_waiting_list_offer`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-19: The web editor lists the two editable new keys in their groups (new-engine section N3)
- **Given** a coach on web Settings → message templates
- **Then** `template-row-waiting_list_added` in "Lista de espera" after `waiting_list_invite`, `template-row-side_moved` in "Adicionado a uma aula", each with its label and description, `side_moved`'s variable chips include `{sideName}`, `waiting_list_added`'s include `{side}`, and there is no `template-row-coach_no_candidate`
test: `frontend/apps/web/src/components/settings/MessageTemplatesSection.test.tsx` › `lists the new engine's editable templates in their groups`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-20: No default names the class level; a coach's own `{level}` still renders (rule 20, PAD-830)
- **Given** a class with level "6-" on a Wednesday at 10:00 and a student Ana
- **When** each of `invite`, `reminder`, `reminder_followup`, `waiting_list_invite`, `class_cancelled`, `waiting_list_added` and `side_moved` is rendered from the default, in `pt` and in `en`
- **Then** no default text contains `{level}` and no rendered message contains "6-"
- **And** for a coach whose stored text for that key contains `{level}`, the message contains "6-", and the stored templates are left as saved
test: `backend/padel_app/tests/test_pad830_no_level_in_defaults.py` › `test_no_default_shows_the_class_level`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-28: A saved text identical to an old default follows the new default; any other text is kept (rule 20, PAD-830)
- **Given** coaches whose stored `message_templates` hold, for a key, the full text of the default that carried `{level}` before PAD-830: one in Portuguese, one in English; one whose text differs from it by a single character; one with a text of their own
- **When** the PAD-830 data migration upgrades
- **Then** each exact match, per key and per locale, is replaced by that key's new default in that locale
- **And** the near-miss and the text of their own are left exactly as saved, and so are the keys the coach never saved
- **And** running the upgrade again changes nothing, and the downgrade puts the old text back where the stored text is the new default
test: `backend/padel_app/tests/test_pad830_template_migration.py` › `test_exact_old_defaults_follow_the_new_default`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-21: `{duration}` is the occurrence's length in minutes (rule 21, PAD-836)
- **Given** a `pt` coach whose invite text is "Aula de {duration} às {time}." and occurrences 18:00–19:00, 18:00–19:30 and 18:00–19:15 of one series whose lesson runs 18:00–19:00
- **When** the engine invites a student to each occurrence
- **Then** the messages read "Aula de 60 min às 18:00.", "Aula de 90 min às 18:00." and "Aula de 75 min às 18:00.": the occurrence's own times, not the lesson's
- **And** an `added_to_class` on the whole series renders the lesson's 60 min
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_duration_is_the_occurrence_length_in_minutes`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-22: The unit is `min` in both locales (rule 21)
- **Given** a 90-minute class and the template "{duration}"
- **When** it renders for a `pt` coach and for an `en` coach
- **Then** both read "90 min", and neither contains "h"
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_duration_unit_is_min_in_pt_and_en`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-23: `{club}` is the class's club, an occurrence's from its lesson (rule 22)
- **Given** a coach whose reminder text is "Lembrete: {weekday} às {time} no {club}." and an occurrence of a lesson at club "Padel Norte"
- **When** the reminder is sent to an enrolled student
- **Then** the message ends "às 18:00 no Padel Norte."
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_club_is_the_lessons_club`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-24: An empty `{club}` or `{duration}` leaves no broken text (rules 21, 22)
- **Given** the values a class with no club name and no valid end would give (`club=""`, `duration=""`)
- **When** "aula às {time} no {club}." and "Aula ({club})" and "aula de {duration} às {time}" render
- **Then** they read "aula às 19:00.", "Aula" and "aula às 19:00", with no raw token, no dangling connector and no space before punctuation
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_empty_club_and_duration_take_their_connector`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-25: Both work in every template; no default uses them; saved texts stay (rules 3a, 21, 22)
- **Given** a coach whose stored text for every template key, `added_to_class` and `added_to_class_coming` included, is "{duration} {club}"
- **When** each message is rendered for a 60-minute class at "Padel Norte"
- **Then** each reads "60 min Padel Norte"
- **And** no default text in either locale contains `{duration}` or `{club}`, and the coach's stored templates are unchanged
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_both_render_in_every_template_and_no_default_uses_them`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-26: The preview's examples carry both (rules 19, 23)
- **Given** `POST /api/app/notify/template_preview` from a `pt` coach
- **When** the template is "{duration} no {club}"
- **Then** the examples carry `duration` "60 min" and a non-empty `club`, and the preview is the template rendered with them by `_format_template`
test: `backend/padel_app/tests/test_pad836_duration_and_club.py` › `test_preview_examples_carry_duration_and_club`

#### NOTIFICATIONS-MESSAGE-TEMPLATES-27: The web editor offers both fields with their examples (rule 23)
- **Given** a coach on web Settings → message templates
- **When** the section renders
- **Then** every field's placeholder badges include `{duration}` and `{club}`, and the help table has a row for each with the meaning ("Duração da aula", "Clube") and the server's example
test: `frontend/apps/web/src/components/settings/MessageTemplatesSection.test.tsx` › `offers {duration} and {club} with their examples (PAD-836)`

### Today (PAD-836)
- Placeholder values: `backend/padel_app/services/message_text.py` `template_variables` (the one set, rule 3a)
  plus `class_placeholders` (`{type}`, `{date}`, `{court}`, `{day}`). No duration or club value exists.
- Empty-value handling: `_format_template` in the same file; `{court}` alone uses
  `_EMPTY_COURT_CONNECTORS` (genitives + locatives), every other key `_EMPTY_PLACEHOLDER_CONNECTORS`.
- Times: `LessonInstance.start_datetime` / `end_datetime` (both NOT NULL, `models/lesson_instances.py:38-39`);
  `Lesson.start_datetime` / `end_datetime` (first occurrence's times). Club: `Lesson.club_id` NOT NULL
  (`models/lessons.py:60`, PAD-591) and `Club.name` NOT NULL, so an empty `{club}` is reachable only for a
  source with no lesson (none today) or a blank name; the empty rule is still needed and tested at the formatter.
- Preview: `template_preview_examples` / `render_template_preview` (same file), served by
  `POST /api/app/notify/template_preview` (`modules/notification_engine_api.py`).
- Web: `frontend/apps/web/src/components/settings/MessageTemplatesSection.tsx` `CLASS_VARIABLES` (badges);
  `TemplateHelp.tsx` `ALL_PLACEHOLDERS` (help rows); copy in `frontend/src/locales/{pt,en}/settings.json`
  `settings.templates.help.fields.*`. iOS: no editor.
- Pinned by: `test_pad670_placeholders_everywhere.py` (`RAW_TEMPLATE`, every key), `test_pad430_template_placeholders.py`,
  `test_pad549_smart_day.py` (preview), `MessageTemplatesSection.test.tsx` (`VOCABULARY` list, line ~203).

### Code to follow (PAD-836)
- `class_placeholders(source, locale)` gains `duration` and `club`: `duration` from the source's own
  `end_datetime - start_datetime` → `f"{minutes} min"` (empty when either is missing or the span is not
  positive); `club` from `(source.lesson if instance else source).club.name`, empty when absent. So
  `template_variables` carries both with no change of its own.
- `_format_template`: `club` joins `court` on `_EMPTY_COURT_CONNECTORS`; `duration` keeps the genitives. No
  other change (brackets, collapse and leading punctuation already run for every key).
- `template_preview_examples`: `duration` "60 min" (sample class 18:00–19:00) and `club` "Padel Norte" in both locales.
- Web: add `{duration}`, `{club}` to `CLASS_VARIABLES` and `ALL_PLACEHOLDERS`; add `help.fields.duration` / `.club`
  in pt and en; update the `VOCABULARY` list in `MessageTemplatesSection.test.tsx`. No iOS change.
- `test_pad670_placeholders_everywhere.py`'s `RAW_TEMPLATE` may add both tokens; not required.

### Waves (PAD-836)
1. -21, -22, -23, -24, -25, -26: backend rendering (`message_text.py`) and `test_pad836_duration_and_club.py`.
2. -27: web editor badges, help rows, locale copy, vitest.
3. The ticket's "print": before/after examples in `docs/plans/messages/pad-836-examples.md` (local).

### Notes
- Secondary outcome: these templates are what a student actually reads when an invitation or
  reminder arrives — see `notifications.coach-fills-vacancies-automatically` and
  `notifications.student-gets-class-reminders`.
- PAD-430 is web-only in the client: iOS has no message-template editor (the templates are edited on
  the web settings page only), so there is no iOS surface to port. The rendering is server-side and
  reaches iOS recipients unchanged.

### Open questions
- Templates for the engine's new kinds (sorry, added, side moved, the coach alert) — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it):
  written in both locales and rendered on web and iOS together; an iOS template editor stays out (the
  PAD-430 reason under Notes).
- The texts of the new kinds — **for the owner's approval**: S proposed them (new-engine section N1, N3,
  PAD-913, 2026-11-12), in the tone of `invite` and `waiting_list_invite`. Until the owner approves,
  PAD-920 builds with the proposed texts and nothing ships to a coach on `new` before the owner has
  read them (the swap's cutover is per coach, `notifications.config` rule 18).
- The alert's key name `coach_no_candidate` and `waiting_list_added` rather than `added` — S's
  (PAD-913, 2026-11-12; the owner can reverse it): rule 11 forbids a name that means another message.
- The `reoffer` template — dropped with the re-offer itself (the owner, 2026-11-12: Codex decision 1 and
  waiting-list answer 4). A sorry student asked again from the waiting list gets `waiting_list_invite`.
- **Q1 (owner, STOP for iOS only; PAD-836).** The ticket asks for the two fields in the editor "na
  web, no iOS e no Android", but PAD-430 recorded that iOS has no template editor (Notes). Options:
  (a) web-only now, rendering reaches iOS recipients unchanged, an iOS editor as its own ticket;
  (b) build an iOS template editor in PAD-836. Lead's recommendation: (a). This spec covers (a)
  only; nothing for an iOS editor is designed here until the owner answers.
- **`{duration}`'s unit follows the coach's locale (PAD-836, messages-m1; the lead can reverse it).**
  The brief said the student's language; rules 6 and 12 render every placeholder in the coach's
  locale because one template is written in one language. `min` is identical in `pt` and `en`, so no
  message differs either way.
