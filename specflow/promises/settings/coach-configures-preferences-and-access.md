---
id: P-SETTINGS-1
title: "Coach configures preferences and access"
status: draft
---
# Coach configures preferences and access

## Outcome

Every signed-in user has one Settings screen for their identity and preferences, reached from the account avatar in the header on both platforms, and each role sees exactly the panels relevant to it: coaches also administer club-wide setup, and students never see or touch coach-only controls.

- Every signed-in user reaches Settings; a student gets a reduced page, never a dead end.
- A student's sections are exactly Profile, Preferences (language and theme), their own notification preferences, My connections, and Account; everything else is coach-only.
- "My connections" is where a person manages their links: connecting with a coach (student), inviting students by link or QR (coach), and blocked people.
- What a role sees and what the server allows always agree; every coach-only action is checked on the server.
- Leaving a section with unsaved changes asks whether to discard them (PAD-394).
- Nothing is saved until "Save changes", one button per tab, on web and in the app (PAD-506). Commands such as approving a join request or adding a court act at once.
- A blank name is refused; an email must be valid and unused; values are trimmed before checking.
- Everyone can correct their own date of birth and country in Profile; a date under 18 is refused with the sign-up message, and neither can be erased (PAD-640).
- An abbreviation defaults to the first letters of the first two words of the name and can be overridden with up to 4 characters.
- The default language is Portuguese, and a missing translation falls back to Portuguese.
- A user's language governs the interface and the wording of notifications and reminders sent to them.
- The theme preference has no visible effect on iOS, which is light-only.

It does not promise the content of notifications, the coach-only panels' own behaviour, or avatar upload, bio or password change from Settings.
