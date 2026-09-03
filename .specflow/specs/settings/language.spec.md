---
id: settings.language
status: draft
depends_on: [auth.login, notifications.reminders, notifications.message-templates]
implements: ../../specs-business/settings/coach-relies-on-settings.business.md
governed_by: []
---

# settings.language


### Intent
Provide internationalization (i18n) infrastructure supporting Portuguese (pt) and English (en), with each
coach able to choose their preferred language in Settings. The preference is persisted per user and drives
locale-aware formatting of auto-generated notification and reminder messages (weekday names, dates, times).
This is the root-cause fix for the mixed-language notification bug (PAD-38): manual weekday/date string
building is replaced with locale-aware formatting.

Scope: i18n INFRASTRUCTURE + NOTIFICATIONS/REMINDERS localization was delivered first (PAD-39). App-wide
UI localization (PAD-40) extends the same i18next infrastructure across the rest of the app UI so the
coach's language preference drives the entire interface, not just notifications. UI strings are
externalized into per-area i18next resource files (`src/locales/{pt,en}/*.json`) and rendered via
`react-i18next`'s `t()`; the coach's persisted `language` is applied globally on session restore and
login (not only while the Settings screen is mounted).

### Entities
- **User.language** (`users.language`): the user's preferred UI/notification locale. Enum-like string,
  one of `pt` | `en`. Defaults to `pt`. Extends the existing User entity (see auth.login).

### Rules
1. `users.language` stores the preferred locale (`pt` or `en`); default and fallback locale is `pt`.
2. The coach can read and update their language in Settings via the profile/settings API
   (`GET`/`PATCH` the current user), and the value is persisted on the User row.
3. Frontend i18n uses **i18next / react-i18next**; backend locale-aware date/time/weekday formatting uses
   **Flask-Babel**. Formatting is never manually string-built from English day/month names.
4. Fallback locale is `pt`: any missing translation key or unresolvable locale falls back to Portuguese —
   no broken strings, no raw English tokens, no unresolved placeholders in delivered output.
5. Auto-generated notification and reminder messages are rendered in the **recipient coach's** locale:
   the notification renderer resolves the recipient's `language` and formats weekday, date, time, and
   template strings accordingly.
6. Weekday, date, and time tokens in notification/reminder templates render in the resolved locale
   (e.g. `pt` → "quarta-feira"; `en` → "Wednesday"), using Flask-Babel, not hardcoded name tables.

### Acceptance Criteria

#### Default language is Portuguese
- **Given** a newly created coach with no explicit language set
- **When** their profile is read
- **Then** `language` is `pt`

#### Coach updates language
- **Given** an authenticated coach
- **When** they PATCH their profile/settings with `{"language": "en"}`
- **Then** the response succeeds and `language` is persisted as `en`
- **And** a subsequent profile read returns `language` = `en`

#### Reminder localized to coach locale (PT)
- **Given** a coach whose `language` is `pt` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "quarta-feira" (Portuguese), formatted via Flask-Babel
- **And** no raw English weekday token and no unresolved placeholder remains

#### Reminder localized to coach locale (EN)
- **Given** a coach whose `language` is `en` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "Wednesday" (English), formatted via Flask-Babel

#### Missing translation falls back to PT
- **Given** a locale/key with no available translation
- **When** a message is rendered
- **Then** the Portuguese value is used and the output contains no raw token or unresolved placeholder

#### Coach language drives the whole UI (PAD-40)
- **Given** a coach whose `language` is `en`
- **When** they open any localized app screen (dashboard, calendar, players, settings, messages, training)
- **Then** the interface chrome (navigation, headings, buttons, labels) renders in English
- **And** switching their language to `pt` in Settings re-renders the same chrome in Portuguese without a full reload
- **And** the applied language survives a page reload (it is re-applied from the persisted preference on session restore, not only while Settings is mounted)

### Notes
- Source: ticket PAD-39
- Supersedes the PAD-38 tactical PT-weekday patch: locale-aware formatting is the root-cause fix.
- Follow-up: PAD-40 localizes the rest of the app UI.
