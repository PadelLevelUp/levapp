---
id: settings.coach-configures-preferences-and-access
status: draft
implemented_by:
  - ../../specs/settings/language.spec.md
  - ../../specs/settings/profile.spec.md
  - ../../specs/settings/role-scope.spec.md
---

# Coach configures preferences and access

## Outcome

Every signed-in user — coach or student — has one Settings screen to manage their own identity
(name, contact details) and preferences (language), and each role sees exactly the configuration
panels that are relevant to them: a coach can also administer club-wide setup like seasons, skill
levels, and evaluation categories, while a student is never shown (or able to touch) those coach-only
controls.

## Who This Is For

Coaches configuring both their personal profile and their club's operating rules, and students
managing only their own personal profile and preferences.

## User Journey

1. Any signed-in user opens Settings and sees their real stored name, contact info, and language
   preference — not placeholder defaults — because the screen is hydrated from their account.
2. They edit their name, short badge abbreviation, email, or phone and save; the app confirms success
   only after the change is actually persisted, and shows an error (never a false "saved") if the save
   fails.
3. They pick their preferred language (Portuguese or English); it's remembered on their account and
   drives both the app's UI text and the wording of auto-generated notifications sent to them, going
   forward and after every login, not just while Settings happens to be open.
4. If a coach, they also see and can manage club-wide configuration from the same screen: seasons, the
   club's skill-level ladder, evaluation scoring categories, the notification engine, data import, and
   club/coach-invitation management.
5. If a student, none of those coach-only panels appear on their Settings screen at all — they see
   Profile, Preferences (language and theme only), their own notification preferences, and Account —
   they are never bounced away from `/settings` altogether, just shown a smaller page.
6. If a student tries a coach-only action directly (not through the UI), the app refuses it outright
   rather than letting it through or crashing.

## Business Rules

- Settings is reachable by every signed-in user; a student gets a reduced page, never a dead end.
- A student's Settings sections are exactly: Profile, Preferences (language + theme), their own
  notification preferences, and Account. Everything else is coach-only.
- What each role can see in the UI and what the server will actually allow always agree — hiding a
  panel in the interface is never treated as the real security boundary; every coach-only action is
  independently checked on the server.
- A blank name is never accepted; an email must be valid and not already used by someone else; those
  values are trimmed before checking.
- An abbreviation (a short badge shown next to the user's name) defaults to the first letters of the
  first two words of their name when not explicitly set, and can be overridden with up to 4 characters.
- The default language is Portuguese; any missing or unresolved translation always falls back to
  Portuguese rather than showing a broken string or placeholder.
- A user's language preference governs both the app's interface text and the phrasing (weekdays,
  dates, times) of auto-generated notifications and reminders sent to them.

## Success Metrics

Not yet measured. No dashboard exists for profile-edit rate, language-switch frequency, or
unauthorized-access attempt volume.

## Out of Scope

- The content and delivery of notifications themselves — see the notifications domain.
- The specific coach-only panels' own behavior (seasons, evaluation categories, import) — each is
  specced in its own domain; this outcome only covers who gets to see and reach them from Settings.
- Avatar upload, bio, and password change from Settings — not built; there's no backend support for
  them yet.

## Notes

None.
