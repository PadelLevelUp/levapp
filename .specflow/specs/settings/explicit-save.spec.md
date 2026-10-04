---
id: settings.explicit-save
status: implementing
depends_on: [settings.role-scope, settings.profile, settings.language, settings.unsaved-edits, evaluations.reminders, evaluations.scale, notifications.request-alerts, notifications.config, calendar.seasons, settings.coach-working-hours, notifications.student-block-preferences]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.explicit-save

### Intent
**Owner decision 2026-10-03 (PAD-506):** every Settings tab is explicit-save. Nothing is saved until
the coach presses **Guardar alterações** / **Save changes**, and leaving a tab or the page with unsaved
edits asks first. One Save per tab holds every edit on that tab; the sections' own Save buttons go. This
replaces the save-on-change model of PAD-473 (its spec, `settings.save-on-change`, was retired with it):
PAD-506 PR 1 covered Perfil, Preferências and Admin; PR 2 covers Notificações, Calendário and the
student's "As minhas notificações". Since PR 2 no Settings control saves on change.

### Entities
- **READS/WRITES:** nothing new. Each setting keeps its own endpoint (`settings.profile`,
  `settings.language`, `notifications.request-alerts`, `levels.*`, `evaluations.reminders`,
  `evaluations.scale`, the admin settings route, `notifications.config`, `calendar.seasons`,
  `settings.coach-working-hours`, `notifications.student-block-preferences`); only *when* it is sent
  changes.

### Rules
1. **Which tabs — every Settings tab with a setting.**
   - **Perfil:** name, abbreviation, email, phone.
   - **Preferências:** language, class-request alerts, coach levels, evaluation frequency (with its
     custom number) and evaluation scale.
   - **Admin:** the coach-approval-required switch.
   - **Notificações (coach, PR 2):** the notification engine — the automatic-notifications switch,
     invitation mode, reminder timing, eligibility rules, open spots visible, invitation groups,
     tiebreakers, restrictions and notification groups — and the message templates (web).
   - **Calendário (coach, PR 2):** the season definition and the weekly working hours (clearing the
     week is held too).
   - **As minhas notificações (student, PR 2):** the three notification blocks and the reason.
   - **Before PAD-506**, language, request alerts, frequency, scale, the admin switch and every
     engine control saved on every change; coach levels, seasons, working hours, the student's
     blocks and web's message templates had their own Save buttons.
2. **Held, not applied.** A change to any of these is held on screen and sent only by the tab's Save.
   Choosing a language does not switch the app's language until the Save is confirmed; the app then
   re-renders in it.
3. **One Save per tab.**
   - **Web:** the page-header **Guardar alterações** (`settings-header-save`) shows on every tab with
     a setting, and is disabled while nothing on the tab differs from what was loaded or saved.
   - **iOS:** each section screen with a setting has a footer **Guardar alterações**,
     `settings-<section>-save` (`settings-profile-save`, `settings-preferences-save`,
     `settings-admin-save`, `settings-notifications-save`, `settings-calendar-save`,
     `settings-myNotifications-save`).
   - **The engine is one part:** every engine field that changed goes in one
     `POST /api/app/notify/config` with only those fields; the message templates are their own
     part (their own request). The Save's answer drives what the timing used to drive on change:
     the "could not re-arm" note (`notifications.config` rule 10c), the past-due question (rule 10f)
     and the eligibility impact note (PAD-150).
   - **What Save does:** it sends every changed setting on the tab — one request per endpoint, one
     `PATCH /auth/me` for profile, language and alerts together. On success it says so once ("Definições
     guardadas" / "Settings saved", `settings.toast.settingsSavedTitle`, both clients) and the tab is
     clean.
   - **When a request fails:** it says which part failed, and that part stays changed and unsaved, so a
     second Save retries only what failed. Parts that succeeded are clean.
4. **Not settings, so they stay immediate:**
   - **Not sent anywhere:** theme is a device preference with no server write.
   - **Commands, not edits:** the competency manager's actions, club courts and join approvals, the
     standing waiting list, import, account deletion, the admin's approve/reject of a coach, removing
     the season (asked first), and sending past-due reminders from the rule-10f question.
     Each of these acts at once and nothing is held.
5. **Leaving asks — everywhere.** With a held edit on the tab:
   - **Web asks** on choosing another Settings tab, on following any in-app link (sidebar, avatar
     menu), on signing out from the avatar menu (Descartar signs out), and when the page is closed or
     reloaded (`beforeunload`).
   - **iOS asks** on the section's back row and the header's back button. While anything is held
     the header back is the app's own button (`settings-header-back`), which asks every time, and
     swipe-back is off; any other removal of the screen is stopped and asks too. iOS's sign-out lives
     on the section list, which holds nothing: the section screen asks before the list is reached.
   - **The question** is `settings.unsaved-edits` rule 4 (Descartar / Continuar a editar).
   - **The one place the browser decides:** web's own Back/Forward buttons move through the app's
     history without a page unload, so no prompt can stop them; the edits are dropped as before.
   - **The one in-app limit:** a programmatic `navigate()` elsewhere in the web app (code that moves
     the router without a link click or the avatar menu's sign-out) does not ask; the edits are
     dropped. Every link click and sign-out goes through the guard.
6. **Unsaved** is by value, not by touch (`settings.unsaved-edits` rule 2): changing a setting and back
   leaves the tab clean and Save disabled.

### Acceptance Criteria

#### A language change is held until Save (web and iOS)
- **Given** a coach on Preferências with the app in English
- **When** they choose Português
- **Then** nothing is sent, the app is still in English, and Save is enabled
- **When** they press Save
- **Then** one `PATCH /auth/me` carries `language: "pt"`, the app switches to Portuguese, and the tab is clean

#### Every held edit on the tab goes in one Save
- **Given** a coach on Preferências who turned request alerts off, renamed a level and chose scale 10
- **When** they press Save
- **Then** `/auth/me`, the levels route and `evaluation_scale` each receive one request, a single
  "Settings saved" is shown, and nothing on the tab is unsaved

#### A failed part stays unsaved
- **Given** the scale request fails and the others succeed
- **Then** the coach is told the scale was not saved, the scale still shows 10 and Save stays enabled;
  the other changes are clean

#### Leaving with a held edit asks (web)
- **Given** a coach changed the evaluation frequency and did not save
- **When** they choose another tab, or click a sidebar link
- **Then** "Descartar alterações?" opens; **Continuar a editar** keeps the edit; **Descartar** leaves

#### Leaving with a held edit asks (iOS)
- **Given** a coach changed the language in Preferências and did not save
- **When** they tap the header's back button or the back row — again after Continuar a editar
- **Then** "Descartar alterações?" appears and the screen stays; swiping back does nothing meanwhile

#### Changed and changed back is clean
- **Given** a coach turned request alerts off and on again
- **Then** Save is disabled and leaving asks nothing

#### An engine change is held, and the Save's answer asks about past-due reminders (PR 2)
- **Given** a coach on Notificações who raised the reminders per student from 1 to 2
- **Then** nothing is sent and Save is enabled
- **When** they press Save and the answer lists a class whose reminder time has passed
- **Then** one `POST /api/app/notify/config` carried `reminderTiming` only, the tab is clean,
  and the past-due question opens

#### A failed engine part stays; the templates part is separate (PR 2)
- **Given** a coach turned automatic notifications off and edited a message template
- **When** they press Save and the templates request fails
- **Then** the engine change is saved and clean, the template still shows the edit, the tab stays
  unsaved and the error names the message templates

#### Seasons, working hours and the student's blocks have no Save of their own (PR 2)
- **Given** a coach changed the season's end month, or a student switched a block on
- **Then** no section button saves it; the tab's Save sends it and leaving first asks

#### Admin's switch is held
- **Given** a superadmin turned "coach approval required" on
- **Then** nothing is sent until Save; Save sends it once

### Notes
- Ledger: none (an owner decision, not a defect).
- **Known limit of the tests:** iOS's screen-level Save and back logic (run every held part, keep the
  failed ones, ask on back) is covered end to end only by Maestro (flows 95, 128, 158 and the converted
  flows); the unit `SectionSaveProbe` re-implements the loop rather than mounting the screen.
- **Known limit:** iOS has no Maestro flow for the student's "As minhas notificações" blocks; they are
  covered by unit tests only.
- **Known limit:** no test drives the Calendário tab's mixed result — seasons failing while working
  hours save; the mixed result is tested on Preferências and Notificações.
- **Known limit:** on iOS a refused season shows its reason inline under the fields; the screen's
  failure toast names only the part ("Época"), not the reason (web's toast carries it, #550 F2).
- PR 2 removed the PAD-473 machinery: the sign, the serial saver, `SaveLedger`, the keepalive and
  background flushes, the reminders form's 600 ms pause (`notifications.config` rule 10d), and the
  spec `settings.save-on-change`. Ledger entries that cite it (B-242, B-243, B-244) are history.
