---
id: settings.language
status: draft
depends_on: [auth.login, notifications.reminders, notifications.message-templates]
serves: [P-SETTINGS-1]
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
5. Auto-generated notification and reminder messages are rendered in the **recipient's** locale: the
   notification renderer resolves the recipient's `language` and formats weekday, date, time, and
   template strings accordingly. The recipient is not always a coach: a class-request message to a
   student (`class_request_service._tell_student`) and a request alert (`request_alert_service`, whose
   recipients also include coaches of other clubs and superadmins) use the recipient's own `language`.
6. Weekday, date, and time tokens in notification/reminder templates render in the resolved locale
   (e.g. `pt` → "quarta-feira"; `en` → "Wednesday"), using Flask-Babel, not hardcoded name tables.
7. **A choice survives the page's own profile load (B-184, PAD-453).** The web Settings page reads the
   profile on mount. Until that read lands, the language select shows the language the app is
   already showing (AuthContext applied the stored one), never a hard-coded `pt`. Once the coach has
   chosen a language, a read that lands later leaves the choice alone, as it already did for the
   profile fields. Since PAD-506 (`settings.explicit-save` rule 2) the chosen language is held until
   the tab's Save, on web and iOS, and the app switches to it once the Save is confirmed; the guard
   still keeps a late read from putting the stored language back on screen while it is held.
8. **On iOS, a save's answer is the newest profile (B-185, PAD-454).** Every iOS Settings save that
   writes the profile cache (`["auth-me"]`: language, request alerts, profile, notification blocks)
   first cancels any `["auth-me"]` read still in flight, then writes the server's answer
   (`src/features/settings/write-auth-me.ts`). Without that, a read that started before the save and
   landed after it put the old value back. The picker, which follows the cache, showed the old
   language while the server and i18n held the new one.

9. **(B-545, PAD-629) Portuguese plurals are European.** A count of zero
   reads in the plural ("0 aulas", not "0 aula"). i18next resolves plurals with
   `Intl.PluralRules("pt")`, which is Brazilian (0 = one), so every pt `_one`/`_other` pair carries
   a `_zero` form with the plural text — i18next prefers `_zero` for a count of 0. A guard over the
   locale files (`apps/web/src/test/pt-plural-zero.test.ts`) fails any new pt plural pair without one.

10. **The phone app carries every string in both languages.** Its bundler cannot load a language on demand, so each namespace is imported for Portuguese and for English; a key present in one language and missing in the other is a defect, because that screen would show the key.

### Acceptance Criteria

#### SETTINGS-LANGUAGE-1: A count of zero reads in the plural in Portuguese (rule 9, B-545)
- **Given** a coach whose language is `pt`, on a day with no classes
- **When** the calendar's day header shows the class count
- **Then** it reads "0 aulas"; with one class "1 aula"; with two "2 aulas"

#### SETTINGS-LANGUAGE-2: Default language is Portuguese
- **Given** a newly created coach with no explicit language set
- **When** their profile is read
- **Then** `language` is `pt`

#### SETTINGS-LANGUAGE-3: Coach updates language
- **Given** an authenticated coach
- **When** they PATCH their profile/settings with `{"language": "en"}`
- **Then** the response succeeds and `language` is persisted as `en`
- **And** a subsequent profile read returns `language` = `en`

#### SETTINGS-LANGUAGE-4: Reminder localized to coach locale (PT)
- **Given** a coach whose `language` is `pt` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "quarta-feira" (Portuguese), formatted via Flask-Babel
- **And** no raw English weekday token and no unresolved placeholder remains

#### SETTINGS-LANGUAGE-5: Reminder localized to coach locale (EN)
- **Given** a coach whose `language` is `en` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "Wednesday" (English), formatted via Flask-Babel

#### SETTINGS-LANGUAGE-6: Missing translation falls back to PT
- **Given** a locale/key with no available translation
- **When** a message is rendered
- **Then** the Portuguese value is used and the output contains no raw token or unresolved placeholder

#### SETTINGS-LANGUAGE-7: Coach language drives the whole UI (PAD-40)
- **Given** a coach whose `language` is `en`
- **When** they open any localized app screen (dashboard, calendar, players, settings, messages, training)
- **Then** the interface chrome (navigation, headings, buttons, labels) renders in English
- **And** switching their language to `pt` in Settings re-renders the same chrome in Portuguese without a full reload
- **And** the applied language survives a page reload (it is re-applied from the persisted preference on session restore, not only while Settings is mounted)

#### SETTINGS-LANGUAGE-8: A late profile read does not undo the chosen language (B-184)
- **Given** the coach `e2e-coach`, whose `language` is `en`, on the web Settings page, with the page's own `GET /auth/me` still in flight
- **When** they choose Portuguese and the held read then lands
- **Then** the select still shows Portuguese
- **And** the `PATCH /auth/me` body carries `{"language": "pt"}`

#### SETTINGS-LANGUAGE-9: An iOS save is not undone by an older profile read (B-185)
- **Given** the iOS profile cache holds `language` `en`, and an `["auth-me"]` read that will answer `en` is in flight
- **When** a language save answers `pt` and is written through `writeAuthMe`, and the older read then lands
- **Then** the cache still holds `pt`
- **And** no mobile file writes a save's answer into `["auth-me"]` except through `writeAuthMe`

#### SETTINGS-LANGUAGE-10: Dates follow the app's language, and any other language reads as Portuguese (rules 3, 4)
- **Given** the app's language set to `pt`, `pt-PT`, `en`, `en-GB`, `fr`, or not set
- **When** a date is formatted, or handed to a native date or time picker
- **Then** `pt` and `pt-PT` format in Portuguese, `en` and `en-GB` in English, and `fr` or no language in Portuguese
- **And** the native pickers get `pt-PT` or `en-US`
- **And** an upper-case code reads as its lower-case (`EN` as `en`) in both helpers
- **And** 15 October 2026 reads `15/10/2026` in Portuguese and `10/15/2026` in English, and a date is the same day in any time zone
- **And** in iOS Settings the import history's timestamps and the invitations' expiry dates follow the app's language
test: `frontend/apps/mobile/src/lib/native-locale.test.ts` › `maps the app's two languages to real region tags` (+12 more)
- Code to follow: `resolveDateLocale` in `frontend/packages/config/src/dateLocale.ts` and
  `frontend/apps/web/src/lib/dateLocale.ts` lower-cases the code, as `nativeLocaleTag` does, with a test for `EN`.

#### SETTINGS-LANGUAGE-11: Only Portuguese and English exist, and the phone app has every string in both (rules 1, 10)
- **Given** a signed-in user, and the phone app's two language bundles
- **When** the user saves the language `fr`, and the bundles are compared
- **Then** the save answers 400
- **And** no key exists in one bundle and not in the other
- **And** every role label exists in both, every key the attendance, absences and class-detail screens use resolves in both, and their interpolated subtitles keep their placeholders
test: `backend/padel_app/tests/test_profile_update.py` › `test_patch_me_rejects_unsupported_language` (+5 more)

### Notes
- Source: ticket PAD-39
- Supersedes the PAD-38 tactical PT-weekday patch: locale-aware formatting is the root-cause fix.
- Follow-up: PAD-40 localizes the rest of the app UI.
