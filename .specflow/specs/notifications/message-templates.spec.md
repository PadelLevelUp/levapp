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
3. Templates support placeholders (player name, class name, date, time)
4. Updated via `POST /api/app/notify/config`
5. Placeholders must render fully substituted with concrete values — a rendered message never contains a raw placeholder token (`{level}`, `{weekday}`, etc.) or a filler artifact such as the literal word "this" in a placeholder slot
6. The `{weekday}`, date, and time placeholders render in the **recipient coach's locale** (see settings.language), formatted via Flask-Babel — e.g. `pt` → "quarta-feira", `en` → "Wednesday". Never manually string-built from English day/month names. Fallback locale is Portuguese
7. When a class instance has no assigned level, the `{level}` placeholder renders an empty string (no filler word), leaving surrounding template text grammatical
8. Every template key always resolves to non-empty text. A stored template that is missing, `null`, not a string, or blank/whitespace-only falls back to the built-in default for the resolved locale (`DEFAULT_MESSAGE_TEMPLATES_PT` for `pt`, `DEFAULT_MESSAGE_TEMPLATES` for `en`). This applies to **every** template key, not just the reminder ones
9. The system never sends a message whose rendered body is empty or whitespace-only. If, after placeholder substitution and the rule-8 fallback, the text is still blank, the message is not sent at all
10. The fallback is resolution-time only: the stored JSON is never rewritten, so a blank the coach saved stays blank in `notification_configs.message_templates`. Every *read* resolves it — `GET /api/app/notify/config` returns the resolved (non-blank) templates, so the settings UI never presents an empty textarea for an un-customized key
11. Template defaults are resolved in the coach's own locale on every path, including the reminder-response, cancellation, invitation-response and waiting-list paths (which previously fell back to the English defaults regardless of `settings.language`)

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
- **And** no raw placeholder token remains in the delivered text

### Notes
- Secondary outcome: these templates are what a student actually reads when an invitation or
  reminder arrives — see `notifications.coach-fills-vacancies-automatically` and
  `notifications.student-gets-class-reminders`.
