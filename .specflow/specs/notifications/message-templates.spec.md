---
id: notifications.message-templates
status: implemented
depends_on: [notifications.config]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
governed_by: []
---

# notifications.message-templates


### Intent
Customize the text of notification messages sent to players.

### Rules
1. Templates stored in `notification_configs.message_templates` JSON
2. Template keys: invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_invite. (PAD-446: `waiting_list_invite` replaces `waiting_list_placed`; a stored `waiting_list_placed` text is ignored.) Since PAD-501, `spot_filled` is sent only to a student whose pending join request was closed because the class filled (`classes.join-requests` rule 10); see rule 15
3. Templates support placeholders (player name, class name, date, time). The templates that describe a class (invite, reminder, reminder_followup, waiting_list_invite, class_cancelled) accept `{name}`, `{level}`, `{weekday}`, `{time}` and, since PAD-430, `{type}`, `{date}` and `{court}` (rules 12–14); the web settings editor lists all seven beside each of the four editable ones. The two `added_to_class` templates (`classes.instance-enrollment` rule 11, PAD-330) accept the same seven plus `{class}` (the class title) and `{when}` (rule 17)
4. Updated via `POST /api/app/notify/config`
5. Placeholders must render fully substituted with concrete values — a rendered message never contains a raw placeholder token (`{level}`, `{weekday}`, etc.) or a filler artifact such as the literal word "this" in a placeholder slot
6. The `{weekday}`, date, and time placeholders render in the **recipient coach's locale** (see settings.language), formatted via Flask-Babel — e.g. `pt` → "quarta-feira", `en` → "Wednesday". Never manually string-built from English day/month names. Fallback locale is Portuguese
7. When a class instance has no assigned level, the `{level}` phrase disappears whole: the placeholder renders an empty string (no filler word) **and the genitive connector directly before it goes with it** — `de`, `da`, `do` in Portuguese, `of` in English — so "aula de {level} esta {weekday}" reads "aula esta quarta-feira" and "aula de {level} de {weekday}" reads "aula de quarta-feira". An empty string alone is not enough: every Portuguese default puts `{level}` after "de" (PAD-346, B-098). Any other word before the placeholder is left as the coach wrote it; the formatter then collapses doubled spaces and space-before-punctuation
8. Every template key always resolves to non-empty text. A stored template that is missing, `null`, not a string, or blank/whitespace-only falls back to the built-in default for the resolved locale (`DEFAULT_MESSAGE_TEMPLATES_PT` for `pt`, `DEFAULT_MESSAGE_TEMPLATES` for `en`). This applies to **every** template key, not just the reminder ones
9. The system never sends a message whose rendered body is empty or whitespace-only. If, after placeholder substitution and the rule-8 fallback, the text is still blank, the message is not sent at all
10. The fallback is resolution-time only: the stored JSON is never rewritten, so a blank the coach saved stays blank in `notification_configs.message_templates`. Every *read* resolves it — `GET /api/app/notify/config` returns the resolved (non-blank) templates, so the settings UI never presents an empty textarea for an un-customized key
11. Template defaults are resolved in the coach's own locale on every path, including the reminder-response, cancellation, invitation-response and waiting-list paths (which previously fell back to the English defaults regardless of `settings.language`)
12. `{type}` renders the class's type (`lessons.type`) as one word in the **coach's** locale, like every other placeholder (rule 6): `academy` → "academia" / "academy", `private` → "privada" / "private". The coach writes the template in one language, so the type word follows the template's language, not the recipient's (PAD-430 decision; the ticket's "recipient language" is met for every recipient who shares the coach's language, which is the only case a single-language template can serve)
13. `{date}` renders the class's start date as `dd/mm` (zero-padded day and month, no year, e.g. "23/02"), from the same wall-clock start the `{weekday}` and `{time}` placeholders use; it is locale-independent
14. `{court}` renders the name of the class's court (`lessons.court`, clubs.courts rule 6; for an occurrence, its own court first, clubs.courts rule 9, PAD-513) and is empty when the class has no court. An empty `{court}` leaves no broken text: the placeholder renders empty and the connector directly before it goes with it — rule 7's genitives plus the locative prepositions `em`, `no`, `na`, `in`, `on`, `at` — then an empty pair of brackets, `()` or `[]`, is removed and rule 7's space/punctuation collapse runs; a message the empty placeholder left starting on punctuation ("No {court}, às {time}.") loses it and its first letter is capitalised ("Às 19:00."). A template the coach opened on punctuation ("- Lembrete: …") keeps it as written. So "aula às {time} no {court}." reads "aula às 19:00." and "aula ({court})" reads "aula". Any other word before it is left as the coach wrote it. None of the built-in defaults use `{type}`, `{date}` or `{court}`; they are opt-in for the coach
15. **No message for an invitation or spot outcome the student already sees (PAD-501; owner: "no message when an invitation expires or the spot is filled").** The `spot_filled` text is not sent:
    - to the other candidates when someone else takes the spot: their invitation shows "Vaga preenchida" (`notifications.invitations` rule 15);
    - to a student whose "yes" arrived after the spot went: the answer reports `spot_filled` / `spot_filled_waiting_list_offered`, both shells show it, and the bubble records it; the waiting-list offer is still sent;
    - to a student whose come-back is refused because the class is full (`attendance.confirm` rule 26): the screen that sent it shows the refusal.
    It is still sent when a pending join request is closed because the class filled (`classes.join-requests` rule 10): the request card's "superseded" is a passive signal and the requester gets nothing else. The web settings editor describes the template that way. iOS has no template settings.
16. `{side}` (PAD-446; numbering unconfirmed) is filled only in `waiting_list_invite`: when the
    vacancy's side is `left` or `right` it renders ` (left side)` / ` (right side)` in the coach's
    locale (pt ` (lado esquerdo)` / ` (lado direito)`), leading space and brackets included; for a
    `both` or empty side it renders as nothing. The default texts put it right after the time, so a
    spot without a side reads as an ordinary sentence. In any other template `{side}` renders as
    nothing.
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

### Acceptance Criteria

#### Declining a reminder with a blank template still sends the default confirmation
- **Given** a coach whose `message_templates` has `reminder_declined` saved as an empty string (or whitespace only), and an enrolled player with a pending reminder for an upcoming class
- **When** the player responds "no" (not coming)
- **Then** the automatic confirmation message sent back to the player is the built-in default for the coach's locale (e.g. pt → "Entendido, obrigado por avisares!")
- **And** no message with empty or whitespace-only text is ever created

#### Blank templates fall back for every message type
- **Given** a coach whose `message_templates` has *all* keys saved as empty strings
- **When** any template-driven automatic message is sent (invite, confirm, decline, spot_filled for a join request closed by a full class, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_confirm, waiting_list_invite)
- **Then** each message body is the built-in default for that key in the coach's locale, never blank

#### Weekday and level render in the coach locale with no artifacts
- **Given** a coach whose `language` is `pt` and whose reminder template is `"Olá {name}, tens aula de {level} esta {weekday} às {time}. Vens?"`, and a class instance on a Wednesday with no assigned level
- **When** a reminder is sent to an enrolled player
- **Then** the rendered message reads "esta quarta-feira" (Portuguese weekday, via Flask-Babel), not "esta Wednesday"
- **And** the `{level}` slot renders empty, so the message never contains the literal word "this"
- **And** the connector goes with it: the text reads "tens aula esta quarta-feira", never "aula de esta" (PAD-346)
- **And** no raw placeholder token remains in the delivered text

#### Class type, day/month and court render in a custom template
- **Given** a coach whose `language` is `pt`, whose invite template is `"Olá {name}, abriu uma vaga numa aula {type} no dia {date} às {time} no {court}."`, and a private class starting 2027-02-23 19:00 on court "Campo 2"
- **When** the engine invites a student named "Ana Silva"
- **Then** the message reads "Olá Ana, abriu uma vaga numa aula privada no dia 23/02 às 19:00 no Campo 2."
- **And** with an `en` coach and an academy class the `{type}` slot reads "academy"

#### A class without a court leaves no broken text
- **Given** the same template and an academy class with no court
- **When** the engine invites the student
- **Then** the message reads "Olá Ana, abriu uma vaga numa aula academia no dia 23/02 às 19:00." — no "no" left dangling and no space before the full stop
- **And** a template `"Aula {type} ({court})"` renders "Aula academia" with no empty brackets

#### The settings editor offers the new placeholders
- **Given** a coach on the web settings page, Message templates section
- **When** they open the invite, reminder, reminder follow-up or waiting-list invitation template
- **Then** the placeholder hints list `{type}`, `{date}` and `{court}` besides `{name}`, `{level}`, `{weekday}` and `{time}`

#### A waiting-list join tells the coach the day, not only the weekday (rule 17, PAD-519)
- **Given** a `pt` coach Ana with a full academy class "Sábado 18h" occurring Saturday 2027-04-10 at 18:00, and an eligible student Carla Santos
- **When** Carla joins that occurrence's waiting list
- **Then** Ana's conversation with Carla gains the message "Carla Santos entrou na lista de espera de Sábado 18h no dia 10/04 (sábado) às 18:00."
- **And** with an `en` coach the text reads "Carla Santos joined the waiting list for Sábado 18h on 10/04 (Saturday) at 18:00."

#### A join request and its decision name the day the same way (rule 17)
- **Given** the same class and a pending join request from Carla
- **When** Ana refuses it
- **Then** Carla's message reads "O teu pedido para entrar em Sábado 18h no dia 10/04 (sábado) às 18:00 não foi aceite."

#### Adding a student to a whole series stays undated (rule 17)
- **Given** a `pt` coach whose `added_to_class` template is the default, and a weekly series "Segunda 10h" starting Monday 2027-04-12 10:00
- **When** the coach adds Carla to the series
- **Then** the message reads "Olá Carla, adicionei-te a Segunda 10h na segunda-feira às 10:00. Até já! 🎾" — no `dd/mm`
- **And** when the coach adds her to the single occurrence of 2027-04-19 instead, it reads "… adicionei-te a Segunda 10h no dia 19/04 (segunda-feira) às 10:00. …"

### Notes
- Secondary outcome: these templates are what a student actually reads when an invitation or
  reminder arrives — see `notifications.coach-fills-vacancies-automatically` and
  `notifications.student-gets-class-reminders`.
- PAD-430 is web-only in the client: iOS has no message-template editor (the templates are edited on
  the web settings page only), so there is no iOS surface to port. The rendering is server-side and
  reaches iOS recipients unchanged.

#### A spot going to someone else sends no "spot filled" message (rule 15, PAD-501)
- **Given** a coach whose `spot_filled` text is "Desculpa já não tenho vaga! Se abrir outra aviso-te", and a class with one open spot offered to students A and B
- **When** A takes the spot, B then answers "yes", and a third student's come-back to the now-full class is refused
- **Then** no chat message with that text is created for B or the third student
- **And** B's invitation shows "Vaga preenchida", B's "yes" is answered `spot_filled_waiting_list_offered` with the waiting-list offer sent, and the come-back is answered `spot_filled`

#### A join request closed by a full class still gets the message (rule 15)
- **Given** the same coach and a pending join request from student C for that class
- **When** the class fills
- **Then** C's request is `superseded` and C receives the `spot_filled` text once
