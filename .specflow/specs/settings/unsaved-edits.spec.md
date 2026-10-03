---
id: settings.unsaved-edits
status: implemented
depends_on: [settings.role-scope, settings.profile, settings.coach-working-hours]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
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
- **READS/WRITES:** nothing new. Each section keeps writing its own entity through its own Save
  (`settings.profile`, `settings.coach-working-hours`, `calendar.seasons`, `levels.*`,
  `notifications.student-block-preferences`, web's message templates).

### Rules
1. **Which sections.** Every section whose edits wait for a Save holds unsaved edits: since PAD-506
   (`settings.explicit-save`) Perfil, Preferências (language, class-request alerts, coach levels,
   evaluation frequency and scale) and Admin wait for the tab's one Save; seasons, working hours, the
   student's notification blocks and web's message templates wait for their own Save until PAD-506 PR 2
   brings them under it. Controls still saved on change (the notification engine / auto-invite
   toggles, until PR 2) have nothing unsaved and never ask (`settings.save-on-change`). Theme is a
   device preference and never asks.
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
   before. The app's own links and iOS's back and swipe ask since PAD-506.

### Acceptance Criteria

#### Switching tab with an unsaved edit asks first (web)
- **Given** a coach on Settings › Calendar has switched Sunday off in working hours and not saved
- **When** they choose the Preferences tab
- **Then** "Descartar alterações?" opens and the Calendar tab stays shown; **Continuar a editar**
  closes it with Sunday still off; choosing Preferences again and **Descartar** shows Preferences,
  and returning to Calendar shows Sunday as the server has it

#### Leaving a section with an unsaved edit asks first (iOS)
- **Given** a coach in the Perfil section has changed their phone number and not saved
- **When** they tap the back row
- **Then** "Descartar alterações?" appears and the section stays open with the new number;
  **Descartar** returns to the section list

#### Nothing unsaved, nothing asked
- **Given** a coach opened working hours and changed nothing, or changed Sunday off and back on
- **When** they switch tab (web) or tap back (iOS)
- **Then** no question appears and they leave at once

#### A saved edit is clean
- **Given** a coach changed a season's label and pressed Save, and the save succeeded
- **When** they switch tab
- **Then** no question appears

#### A save-on-change control never asks
- **Given** a coach toggled an auto-invite setting (saved on change until PAD-506 PR 2)
- **When** they leave the section
- **Then** no question appears

#### A held language asks (PAD-506)
- **Given** a coach changed the language and did not press Save
- **When** they leave the tab
- **Then** "Descartar alterações?" appears

#### Closing the page with an unsaved edit (web)
- **Given** a Settings section holds an unsaved edit
- **When** the page is about to unload
- **Then** a `beforeunload` handler is registered; with no unsaved section none is

### Notes
- Ledger: B-157 (reserved by Session D on 2026-09-21 for this observation, cited in B-155).
- Each section reports its own "unsaved" state to the page/screen that switches sections; the
  page asks. Sections keep their B-155 load guards unchanged.
