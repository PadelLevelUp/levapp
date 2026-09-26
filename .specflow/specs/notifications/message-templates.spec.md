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
2. Template keys: invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_placed
3. Templates support placeholders (player name, class name, date, time). The templates that describe a class (invite, reminder, reminder_followup, waiting_list_placed, class_cancelled) accept `{name}`, `{level}`, `{weekday}`, `{time}` and, since PAD-430, `{type}`, `{date}` and `{court}` (rules 12–14); the web settings editor lists all seven beside each of the four editable ones
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
14. `{court}` renders the name of the class's court (`lessons.court`, clubs.courts rule 6) and is empty when the class has no court. An empty `{court}` leaves no broken text: the placeholder renders empty and the connector directly before it goes with it — rule 7's genitives plus the locative prepositions `em`, `no`, `na`, `in`, `on`, `at` — then an empty pair of brackets `()` is removed and rule 7's space/punctuation collapse runs. So "aula às {time} no {court}." reads "aula às 19:00." and "aula ({court})" reads "aula". Any other word before it is left as the coach wrote it. None of the built-in defaults use `{type}`, `{date}` or `{court}`; they are opt-in for the coach

### Acceptance Criteria

#### Declining a reminder with a blank template still sends the default confirmation
- **Given** a coach whose `message_templates` has `reminder_declined` saved as an empty string (or whitespace only), and an enrolled player with a pending reminder for an upcoming class
- **When** the player responds "no" (not coming)
- **Then** the automatic confirmation message sent back to the player is the built-in default for the coach's locale (e.g. pt → "Entendido, obrigado por avisares!")
- **And** no message with empty or whitespace-only text is ever created

#### Blank templates fall back for every message type
- **Given** a coach whose `message_templates` has *all* keys saved as empty strings
- **When** any template-driven automatic message is sent (invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_confirm, waiting_list_placed)
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
- **When** they open the invite, reminder, reminder follow-up or waiting-list-placed template
- **Then** the placeholder hints list `{type}`, `{date}` and `{court}` besides `{name}`, `{level}`, `{weekday}` and `{time}`

### Notes
- Secondary outcome: these templates are what a student actually reads when an invitation or
  reminder arrives — see `notifications.coach-fills-vacancies-automatically` and
  `notifications.student-gets-class-reminders`.
- PAD-430 is web-only in the client: iOS has no message-template editor (the templates are edited on
  the web settings page only), so there is no iOS surface to port. The rendering is server-side and
  reaches iOS recipients unchanged.
