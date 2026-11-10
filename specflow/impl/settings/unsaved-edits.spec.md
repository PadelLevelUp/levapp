---
id: settings.unsaved-edits
status: implemented
depends_on: [settings.role-scope, settings.profile, settings.coach-working-hours]
serves: [P-SETTINGS-1]
governed_by: []
---

# settings.unsaved-edits

### Intent
A coach who edits a Settings section and then moves to another one used to lose the edit without a
word: both shells show one section at a time, and leaving a section unmounts it (PAD-394, ledger
B-157). The user cannot tell that loss from PAD-392's (a late load undoing an edit, B-155). This
leaf makes the loss a choice: leaving a section with unsaved edits asks first.

**Decided 2026-09-22 (PAD-394, coordinator for the owner): warn, not hold.** No spec or canvas
answered it. Holding drafts across sections was rejected: a held draft is invisible state that
competes with the server's value, with the B-155 load guards and with the same account on another
device. The server stays the one truth; the user decides at the moment of leaving.

### Entities
- **READS/WRITES:** nothing new. Each section keeps writing its own entity through the tab's one Save
  (`settings.profile`, `settings.coach-working-hours`, `calendar.seasons`, `levels.*`,
  `notifications.student-block-preferences`, web's message templates).

### Rules
1. **Which sections.** Since PAD-506 (`settings.explicit-save`) every setting on every Settings tab
   waits for the tab's one Save, so every section with a setting can hold unsaved edits: Perfil,
   Preferências (language, class-request alerts, coach levels, evaluation frequency and scale), Admin,
   Notificações (the notification engine and web's message templates), Calendário (seasons, working
   hours) and the student's "As minhas notificações". Theme is a device preference and never asks;
   commands (`settings.explicit-save` rule 4) hold nothing and never ask.
2. **Unsaved means different from the last loaded or saved value**, compared by value, not by "was
   touched": an edit undone by hand is not unsaved. A successful Save makes the section clean; a
   failed Save leaves it unsaved.
3. **Where leaving is asked.** Web: choosing another Settings tab, and (PAD-506) following an in-app
   link out of Settings. iOS: the section's back row (`settings-back`) and (PAD-506) the header's back
   button; swipe-back is off while anything is unsaved. With nothing unsaved, all of them leave at once, exactly as before.
4. **The question.** "Descartar alterações?" / "Discard changes?", a sentence saying the section's
   changes are not saved, and two actions: **Descartar** / Discard (leave; the edits are dropped
   and the section reloads from the server when reopened) and **Continuar a editar** / Keep
   editing (stay; every edit is where it was). Nothing is saved by answering. Copy lives in the
   `settings` namespace on both shells (`settings.unsavedChanges.*`), pt and en.
5. **Web: closing or reloading the page** while any section is unsaved triggers the browser's own
   leave-page prompt (`beforeunload`); the browser owns its wording.
6. **Limit, named.** Web's browser Back/Forward buttons move through the app's history without a
   page unload, so no prompt can stop them (`settings.explicit-save` rule 5); they drop unsaved edits as
   before. The one in-app limit is a programmatic `navigate()` elsewhere in the web app (not a link
   click, not the avatar menu's sign-out): it does not ask and drops the edits
   (`settings.explicit-save` rule 5). The app's own links, the avatar menu's sign-out (#550) and iOS's
   back and swipe ask since PAD-506.

### Acceptance Criteria

#### SETTINGS-UNSAVED-EDITS-1: Switching tab with an unsaved edit asks first (web)
- **Given** a coach on Settings › Calendar has switched Sunday off in working hours and not saved
- **When** they choose the Preferences tab
- **Then** "Descartar alterações?" opens and the Calendar tab stays shown; **Continuar a editar**
  closes it with Sunday still off; choosing Preferences again and **Descartar** shows Preferences,
  and returning to Calendar shows Sunday as the server has it

#### SETTINGS-UNSAVED-EDITS-2: Leaving a section with an unsaved edit asks first (iOS)
- **Given** a coach in the Perfil section has changed their phone number and not saved
- **When** they tap the back row
- **Then** "Descartar alterações?" appears and the section stays open with the new number;
  **Descartar** returns to the section list

#### SETTINGS-UNSAVED-EDITS-3: Nothing unsaved, nothing asked
- **Given** a coach opened working hours and changed nothing, or changed Sunday off and back on
- **When** they switch tab (web) or tap back (iOS)
- **Then** no question appears and they leave at once

#### SETTINGS-UNSAVED-EDITS-4: A saved edit is clean
- **Given** a coach changed a season's label and pressed Save, and the save succeeded
- **When** they switch tab
- **Then** no question appears

#### SETTINGS-UNSAVED-EDITS-5: A held engine change asks (PAD-506 PR 2)
- **Given** a coach toggled an auto-invite setting and did not press Save
- **When** they leave the section
- **Then** "Descartar alterações?" appears

#### SETTINGS-UNSAVED-EDITS-6: A held language asks (PAD-506)
- **Given** a coach changed the language and did not press Save
- **When** they leave the tab
- **Then** "Descartar alterações?" appears

#### SETTINGS-UNSAVED-EDITS-7: Closing the page with an unsaved edit (web)
- **Given** a Settings section holds an unsaved edit
- **When** the page is about to unload
- **Then** a `beforeunload` handler is registered; with no unsaved section none is

#### SETTINGS-UNSAVED-EDITS-8: A section is unsaved exactly while its content differs from what was last loaded or saved (rule 2)
- **Given** a level list, a season and a week of working hours as loaded
- **When** each is edited and compared with what was loaded
- **Then** a level list is unsaved when a field, the order or the set of rows differs, and clean again when an added row is removed
- **And** a season is unsaved when a field differs, and the default draft of a coach with no season is clean
- **And** a week is unsaved when a day's off flag, or a window's start or end, differs
- **And** equal content is clean even when it was rebuilt
test: `frontend/apps/mobile/src/features/settings/coach-levels-section.test.tsx` › `is false for the identical list, true for an edited field` (+10 more)

#### SETTINGS-UNSAVED-EDITS-9: The question is asked only when leaving would lose something (rules 3, 6)
- **Given** web Settings on Calendar with Sunday switched off and not saved
- **When** the coach presses the Calendar tab again, goes back to the section list on a narrow screen, and signs out
- **Then** choosing the tab already shown asks nothing and keeps the edit
- **And** going back to the list on a narrow screen asks nothing, and the section is still there with its edit when reopened
- **And** signing out asks first; Discard signs out and saves nothing; with nothing held it signs out at once
test: `frontend/apps/web/src/pages/SettingsPage.test.tsx` › `choosing the tab that is already active never asks` (+3 more)

### Notes
- Ledger: B-157 (reserved by Session D on 2026-09-21 for this observation, cited in B-155).
- Each section reports its own "unsaved" state to the page/screen that switches sections; the
  page asks. Sections keep their B-155 load guards unchanged.

### Open questions

- **The iOS back-row tests would stay green if the real screen broke.** They exercise a handler copied into `unsaved-registry.test.tsx`. The real screen's header back and swipe (`usePreventRemove`, `gestureEnabled: !hasUnsaved`) have no test. Recommendation: tag a Maestro flow to SETTINGS-UNSAVED-EDITS-2.
- **Rule 1 still lists "Admin" among the sections.** Settings → Admin was removed with PAD-532. Recommendation: delete the word.
