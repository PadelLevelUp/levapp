---
id: settings.save-on-change
status: implementing
depends_on: [settings.role-scope, settings.language, settings.unsaved-edits, notifications.config, evaluations.reminders, evaluations.scale]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.save-on-change

### Intent
Some Settings controls are stored the moment they change, with no Save button. Until PAD-473 most of them
gave no sign that anything was stored, and a failed save either said nothing or snapped the control back
silently (B-243). A coach reported that changing the evaluation frequency "has no save action and does not
persist": it did persist, but nothing said so. This leaf is the counterpart of `settings.unsaved-edits`
(which governs the sections that wait for a Save): it says what a save-on-change control shows when it
saves, when it fails, and where a Save button may appear. One rule, stated once and cited by the leaves
that own each setting.

**Decided 2026-10-01/02 (PAD-473, coordinator for the owner):** an inline sign beside the control, not a
toast; every save-on-change control, on both clients, converges on it.

### Entities
- **READS/WRITES:** nothing new. Each control keeps writing its own setting through its own endpoint
  (`settings.language`, `notifications.request-alerts`, `notifications.config`, `evaluations.reminders`,
  `evaluations.scale`).

### Rules
1. **Which controls.** Every Settings control that persists to the server without a Save button, on web
   and iOS. Today: language (web too, since PAD-473; B-244), class-request alerts, the notification
   engine's controls (on/off, invitation mode, eligibility and open spots, invitation groups,
   tiebreakers, restrictions, notify groups; web has all, iOS the subset it ports), evaluation frequency
   and evaluation scale. The engine's reminders subsection (`reminderTiming`,
   `invitationStartTiming`) is one of them since PAD-478: its edits are held until the coach pauses
   (`notifications.config` rule 10d) and are then saved through the card's one save, with the sign,
   like every other engine control. A save the server stored but whose scheduled jobs it could not
   re-arm is a confirmed save, and the form says so on its own line (`notifications.config` rule
   10c). Not in scope: theme (a device preference with no server write)
   and message templates (explicit Save, `settings.unsaved-edits` rule 1). A guard per client fails when
   a Settings file saves on change without the sign (see Tests).
2. **The sign.** When the server confirms a save, the control shows "Guardado" / "Saved" with a tick,
   inline beside that control, for about 2 seconds, then it goes. Not a toast. It appears once per pause:
   only when the newest save for that control has been confirmed and no newer save for it started for a
   short pause (600 ms today), so a run of quick changes gives one sign at the end, not one per change.
   A number typed into a field is saved shortly after typing stops (`evaluations.reminders` rule 1), so
   the sign follows typing once. The sign is announced to assistive technology (a polite live region on
   web; an accessibility announcement on iOS) — a tick only sighted users get is half a sign.
3. **A failed save is never silent.** It says so at once, inline beside the control ("Não foi possível
   guardar" / "Couldn't save"), and the control returns to the last value the server confirmed — the
   answer to the newest confirmed save, by the order the saves were sent (an answer arriving late never
   moves it back), never a copy taken when the save started (B-243). If the newest save failed and an
   older one is confirmed afterwards, the control shows what that confirmation stored. A read of the
   settings never replaces a value a save has touched — in the record, and on screen: on iOS a profile
   read that lands while a save is out does not survive that save's answer (the answer wins unless a
   newer save of the field is still out); on web the opening read does not replace a chosen language
   (B-184), and request alerts cannot be changed before that read lands. The failure
   stays until the coach changes that control again. Only the newest save of a control decides its
   sign: an older save that fails after a newer one was confirmed shows nothing. Every save-on-change
   control keeps this record the same way, through the shared `SaveLedger` (`@levelup/config`).
   **The server ends in sending order** because a control never has two saves of one setting in flight:
   while one is out, a newer change waits (the latest replaces an older waiting one; engine patches
   merge) and is sent when the answer comes — `createSerialSaver` (`@levelup/config`). One exception,
   named: web's keepalive send when the page goes away (closed, or hidden by a tab switch)
   goes at once and drops any value still waiting in the queue, so nothing older follows it. It goes at
   once for a hidden tab too, not only a closing page: closing a tab (Cmd-W) fires "hidden" and
   "pagehide" in the same task, so the two cannot be told apart in time, and a request queued then would
   die with the page. On iOS, when the app leaves the foreground (and when the evaluation frequency's
   screen goes away), a save waiting behind one in flight is sent at once rather than queued, since a
   suspended app may never send it. **Remaining limits, named:** in each of these cases — iOS leaving the
   foreground, a web tab closing, a web tab hidden — a request already in flight when the immediate one
   left may reach the server after it; the screen then shows the newer value, with its sign, while the
   server holds the older one until the settings are read again (reopening Settings). Signing out drops
   every value still waiting in any queue, so a setting is never sent with the next account's session.
   Outside those named limits, the sign appears only for a value the server confirmed, and a failed
   save is always shown.
4. **Where a Save button appears.** Web's page-header "Guardar alterações" appears only on a tab that
   holds explicit-save fields (today: Perfil), because a Save button must save what is on the screen in
   front of it. A tab where everything saves on change shows none; a new explicit-save field on such a
   tab brings the button back with it. iOS has no page-level button.
5. **Language.** The page re-renders in the chosen language as it saves, so its sign appears in the new
   language — intended. `settings.language` rule 7's late-read guard (B-184) stays as it is.

### Acceptance Criteria

#### A save-on-change control signs its save once (rules 1, 2)
- **Given** coach `e2e-coach` on Settings → Preferences
- **When** they choose "1-10" in "Escala de avaliações"
- **Then** "Guardado" appears beside the scale once the save is confirmed, is announced politely, and is
  gone about 2 seconds later

#### Quick changes give one sign (rule 2)
- **Given** a save-on-change control
- **When** the coach changes it three times within half a second and all three saves succeed
- **Then** the sign appears once, after the last confirmed save, not three times

#### A failed save says so and shows the confirmed value (rule 3, B-243)
- **Given** the engine's open-spots switch confirmed off by the server
- **When** the coach switches it on and the save fails
- **Then** "Não foi possível guardar" shows beside the switch and the switch is off again

#### Overlapping saves return to the last confirmed value (rule 3, B-243)
- **Given** the master toggle confirmed on
- **When** the coach switches it off (save A) and on again (save B), B is confirmed, and then A fails
- **Then** the toggle shows on — the value B confirmed — and its sign says saved: an older save's
  answer never speaks over a newer one's

#### Web language saves on change (rules 1, 4, 5; B-244)
- **Given** a coach on `en` on Settings → Preferences on web
- **When** they choose Português and do not press anything else
- **Then** `PATCH /api/auth/me` stores `pt`, the sign appears in Portuguese, and a reload shows `pt`

#### The header Save shows only where something waits for it (rule 4)
- **Given** a coach on web Settings
- **When** they open Perfil, then Preferências, then Notificações
- **Then** "Guardar alterações" is visible on Perfil only

#### The reminders subsection saves like the other engine controls (rule 1, PAD-478)
- **Given** the engine's reminders subsection
- **When** the coach changes a timing and pauses
- **Then** one save goes through the card's save, waits its turn behind a save already out, and shows the sign
- **And** a failed save says so and returns the controls to the confirmed value

### Tests
- One save in flight: `packages/config/src/serial-saver.test.ts`, and per family "a change made meanwhile
  waits and is sent when it returns" (web scale, engine; iOS scale, request alerts, engine).
- The record: `packages/config/src/save-ledger.test.ts` (newest only, both held saves failing, recovery after
  the newest failed, sending order, answer over patch, independent fields, a read never replaces a saved
  field).
- Web: `src/components/settings/SaveSign.test.tsx` (sign, pause, failure, newest save only, live region);
  `EvaluationReminderSetting.test.tsx` / `EvaluationScaleSetting.test.tsx` (incl. "the sign follows typing
  once", counted by signs shown, and a failure landing mid-typing); `src/pages/SettingsPage.test.tsx`
  (language, request alerts, the late read, the header Save, "frequency and scale never ask");
  `NotificationsEngineSection.test.tsx` (signs per key, B-243 rollback, both held saves failing, the
  reminders sub-panel signing and queueing since PAD-478); the guard `src/components/settings/save-on-change-guard.test.ts`.
- iOS: `src/features/settings/save-sign.test.tsx`; the evaluation twins' tests; `preferences-section.test.tsx`
  (with a react-query stand-in that keeps a real cache); `auto-invite-section.test.tsx`; the guard
  `src/features/settings/save-on-change-guard.test.ts` (incl. rule 4's "no page-level Save on iOS").
- E2E only: rule 5 (the sign in the new language) and `settings.language` rule 7's save on choice —
  `e2e/settings/save-on-change.spec.ts`, `e2e/settings/language-preference.spec.ts`; Maestro flow 129 (iOS).
- What the guards cannot see (rule 1 is a property; the guards approach it): a save-on-change endpoint
  they do not name (they know `updateMe`, `updateNotificationConfig`, the evaluation save hooks), a
  control that saves without going through those calls, a sign rendered but hidden by layout, and a sign
  shown beside the wrong control. Rule 4's "a new explicit-save field brings the button back" is
  guidance for whoever adds one: the header renders on Perfil only (`activeTab === "profile"`), so a new
  explicit-save field elsewhere must change that condition, which review checks.

### Notes
- The per-keystroke and per-drag saves of some engine controls (invitation-group numbers, tiebreaker
  drag) are unchanged; the sign's pause keeps them to one sign. They are pure stores read at send time
  (`notification_service.update_config`); reminder timing is not, which is PAD-478.
