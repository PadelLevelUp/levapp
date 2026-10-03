---
id: settings.explicit-save
status: implementing
depends_on: [settings.role-scope, settings.profile, settings.language, settings.unsaved-edits, evaluations.reminders, evaluations.scale, notifications.request-alerts]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.explicit-save

### Intent
**Owner decision 2026-10-03 (PAD-506):** every Settings tab is explicit-save. Nothing is saved until
the coach presses **Guardar alterações** / **Save changes**, and leaving a tab or the page with unsaved
edits asks first. One Save per tab holds every edit on that tab; the sections' own Save buttons go. This
replaces the save-on-change model (`settings.save-on-change`, PAD-473) tab by tab: PAD-506 PR 1 covers
Perfil, Preferências and Admin; PR 2 covers Notificações, Calendário and the student's "As minhas
notificações", and retires `settings.save-on-change`.

### Entities
- **READS/WRITES:** nothing new. Each setting keeps its own endpoint (`settings.profile`,
  `settings.language`, `notifications.request-alerts`, `levels.*`, `evaluations.reminders`,
  `evaluations.scale`, the admin settings route); only *when* it is sent changes.

### Rules
1. **Which tabs (PR 1).**
   - **Perfil:** name, abbreviation, email, phone.
   - **Preferências:** language, class-request alerts, coach levels, evaluation frequency (with its
     custom number) and evaluation scale.
   - **Admin:** the coach-approval-required switch.
   - **Before PAD-506**, language, request alerts, frequency, scale and the admin switch saved on
     every change, and coach levels had their own "Guardar níveis" button.
2. **Held, not applied.** A change to any of these is held on screen and sent only by the tab's Save.
   Choosing a language does not switch the app's language until the Save is confirmed; the app then
   re-renders in it.
3. **One Save per tab.**
   - **Web:** the page-header **Guardar alterações** (`settings-header-save`) shows on every tab with
     a setting, and is disabled while nothing on the tab differs from what was loaded or saved.
   - **iOS:** each section screen with a setting has a footer **Guardar alterações**,
     `settings-<section>-save` (`settings-profile-save`, `settings-preferences-save`,
     `settings-admin-save`).
   - **What Save does:** it sends every changed setting on the tab — one request per endpoint, one
     `PATCH /auth/me` for profile, language and alerts together. On success it says so once ("Alterações
     guardadas" / "Changes saved") and the tab is clean.
   - **When a request fails:** it says which part failed, and that part stays changed and unsaved, so a
     second Save retries only what failed. Parts that succeeded are clean.
4. **Not settings, so they stay immediate:**
   - **Not sent anywhere:** theme is a device preference with no server write.
   - **Commands, not edits:** the competency manager's actions, club courts and join approvals, the
     standing waiting list, import, account deletion, and the admin's approve/reject of a coach.
     Each of these acts at once and nothing is held.
5. **Leaving asks — everywhere.** With a held edit on the tab:
   - **Web asks** on choosing another Settings tab, on following any in-app link (sidebar, avatar
     menu), and when the page is closed or reloaded (`beforeunload`).
   - **iOS asks** on the section's back row and the header's back button. While anything is held
     the header back is the app's own button (`settings-header-back`), which asks every time, and
     swipe-back is off; any other removal of the screen is stopped and asks too.
   - **The question** is `settings.unsaved-edits` rule 4 (Descartar / Continuar a editar).
   - **The one place the browser decides:** web's own Back/Forward buttons move through the app's
     history without a page unload, so no prompt can stop them; the edits are dropped as before.
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
  "Changes saved" is shown, and nothing on the tab is unsaved

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

#### Admin's switch is held
- **Given** a superadmin turned "coach approval required" on
- **Then** nothing is sent until Save; Save sends it once

### Notes
- Ledger: none (an owner decision, not a defect).
- The PAD-473 sign, serial saver, `SaveLedger` and the keepalive / background flushes are no longer used
  by these tabs; they remain for PR 2's tabs until it lands.
