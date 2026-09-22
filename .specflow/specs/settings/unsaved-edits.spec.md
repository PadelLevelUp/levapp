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
1. **Which sections.** Only sections whose edits wait for an explicit Save hold unsaved edits:
   profile, coach levels, seasons, working hours and the student's notification blocks, on web and
   iOS, plus web's message templates. Sections that save on every change (language, theme, class
   request alerts, the notification engine / auto-invite toggles) have nothing unsaved and never
   ask.
2. **Unsaved means different from the last loaded or saved value**, compared by value, not by "was
   touched": an edit undone by hand is not unsaved. A successful Save makes the section clean; a
   failed Save leaves it unsaved.
3. **Where leaving is asked.** Web: choosing another Settings tab. iOS: the section's back row
   (`settings-back`), the only way from a section to the section list. With nothing unsaved, both
   leave at once, exactly as before.
4. **The question.** "Descartar alterações?" / "Discard changes?", a sentence saying the section's
   changes are not saved, and two actions: **Descartar** / Discard (leave; the edits are dropped
   and the section reloads from the server when reopened) and **Continuar a editar** / Keep
   editing (stay; every edit is where it was). Nothing is saved by answering. Copy lives in the
   `settings` namespace on both shells (`settings.unsavedChanges.*`), pt and en.
5. **Web: closing or reloading the page** while any section is unsaved triggers the browser's own
   leave-page prompt (`beforeunload`); the browser owns its wording.
6. **Limits, named.** Not asked: leaving Settings through the app's own navigation — web's
   `BrowserRouter` has no route blocker, and on iOS the stack's back button and swipe-back pop the
   whole Settings screen. Both still drop unsaved edits as before. Revisit only if a data router
   (web) or a `beforeRemove` guard (iOS) is adopted.

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

#### A save-on-change section never asks
- **Given** a coach changed the language, or toggled an auto-invite setting
- **When** they leave the section
- **Then** no question appears

#### Closing the page with an unsaved edit (web)
- **Given** a Settings section holds an unsaved edit
- **When** the page is about to unload
- **Then** a `beforeunload` handler is registered; with no unsaved section none is

### Notes
- Ledger: B-157 (reserved by Session D on 2026-09-21 for this observation, cited in B-155).
- Each section reports its own "unsaved" state to the page/screen that switches sections; the
  page asks. Sections keep their B-155 load guards unchanged.
