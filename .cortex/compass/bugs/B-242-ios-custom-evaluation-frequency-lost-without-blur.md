---
id: B-242
title: "iOS 'Personalizado' evaluation frequency: a typed number is lost when the coach leaves without blurring the field"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - evaluations.reminders
  - frontend/apps/mobile/src/features/evaluations/evaluation-reminder-setting.tsx
proposed_fix: "evaluations.reminders rule 1 says when a typed number is saved; iOS also commits a pending valid number on unmount and when the app leaves the foreground."
opened: 2026-10-01T18:32:34Z
resolved: 2026-10-02T08:31:32Z
---

# B-242: iOS "Personalizado" drops a typed number unless the field blurs

**Source:** PAD-473 (a coach via Discord: "changing frequência de avaliações has no save action and the
change does not persist"), reproduced by Session-C on 2026-10-01.

**What happens:** choosing "Personalizado" saves `everyN: 4` at once. A number typed afterwards is sent
only from `onBlur` / `onSubmitEditing`. The field uses `keyboardType="number-pad"`, which has no Return
key, so nothing saves until the field loses focus. Leaving the screen another way loses the number:

| exit with the field focused, holding "7" or "9" (`copyTextFrom` confirmed) | server afterwards |
|---|---|
| deep link (`openLink levelup://players`, the path a notification tap takes) | `everyN: 4`, no PUT |
| Home button, then back to the app | `everyN: 4`, no PUT |
| header back chevron (native pop blurs the field) | `everyN: 7`, saved |

**What should happen:** a valid number the coach typed is saved however they leave the screen.

**Evidence:** iPhone 17 Pro simulator, debug 1.1.2 (6), Metro from `feature/pad-473` at staging
`439ae2088`, Flask on an isolated E2E database. Scratch Maestro flows `c1-custom-focused-leave`,
`c1b-custom-focused-back` and `c2-custom-home`; the server state was read with `GET
/api/app/evaluation_settings` after each, and the PUT count from the Flask access log. Radio options and
the scale saved and survived navigation and a kill-and-relaunch, so only the typed number is affected.
On web the same control also saves on blur, but in-app navigation blurs the input first (Playwright
probe: the choice survived navigation and reload), so web is not affected beyond a hard reload with
the field focused.

**Root cause (diagnostic tree):** the governing spec `evaluations.reminders` exists and rule 1 defines
"Personalizado" → "a number field … default 4", but no rule says **when a typed number is saved**.
Blur/Enter was an implementation choice that the iOS number pad cannot honour → Type 2, incomplete rule.

**Affected specs:**
- Dev: `.specflow/specs/evaluations/reminders.spec.md` (rule 1)
- Business: `.specflow/specs-business/evaluations/coach-evaluates-a-player.business.md` (no change: it
  states the outcome, not the save mechanics)

### Change Plan

**Spec to modify:** `.specflow/specs/evaluations/reminders.spec.md`
**Change type:** add to rule 1 + one acceptance criterion

**Add to rule 1:** "A typed number is saved when the field loses focus or is submitted, and also when
the coach leaves the screen or the app leaves the foreground with the field still focused: a valid
number the coach typed is never dropped (B-242). An invalid one is not sent."

**Add this criterion:**
- **Given** a coach on iOS with "Personalizado" chosen (stored `everyN: 4`)
- **When** they type 7 and send the app to the background, or leave the screen by a link, with the field
  still focused
- **Then** `GET /api/app/evaluation_settings` returns `{reminder: 'every_n_classes', everyN: 7}`

**Then:**
1. Maestro flow 128 (red first against the current code)
2. iOS fix: commit a pending, changed, valid number on unmount and on `AppState` leaving `active`
3. Flow 128 green; mobile unit test for the commit-on-background path
4. Regression: flow 97, mobile evaluation tests

### Decisions (coordinator, 2026-10-01)

- **Save a valid typed number after a short debounce (600 ms)**, with blur, submit, unmount and the
  app leaving the foreground flushing any pending one. Commit-on-unmount alone cannot close the link
  path: when expo-router pushes the linked screen over Settings, Preferences stays mounted and
  nothing fires. Web gets the same rule for parity.
- **A debounce saves intermediate values** (typing "12" slowly saves 1, then 12). This is safe
  because the PUT has no side effect: `put_evaluation_settings` only writes
  `evaluation_reminder_type` / `_value` (`backend/padel_app/services/evaluation_api_service.py:866-869`),
  `NotificationConfig` has no validators or ORM event listeners, and the only reader is
  `_reminder_setting` (`:787-796`), which computes `due` at request time. `evaluations.reminders` rule
  5 forbids any scheduler job, push or e-mail. Nothing fires on an intermediate "1".
- **Web hard reload with the field focused:** left as is, by decision. A hard reload is not in-app
  navigation, and the debounce narrows the window to 600 ms.

### Resolution

- Spec changes: `evaluations.reminders` rule 1 (a typed number is never dropped) + criterion "A typed
  number is saved however the coach leaves it".
- Tests added: mobile `evaluation-reminder-setting.test.tsx` (6; 4 red against staging's component:
  delay, background, leaving, retry after failure), web `EvaluationReminderSetting.test.tsx` +3 (2 red
  against staging's: delay, leaving); Maestro flow 128, red against staging at `afterBackground == 7`
  (2026-10-01).
- Code changes: both twins save a valid typed number 600 ms after typing stops, flush it on
  blur/submit and on unmount; iOS also through the existing `useFlushOnBackground` (PAD-396). A
  number already sent is not sent twice; a failed save clears that, so the same number retries.
- Flow 128 green on the fix, twice (2026-10-02 08:26Z and 08:31Z, iPhone 17 Pro simulator, Metro
  from `fix/b242-custom-frequency` after merging staging 9fe5fefa9); flow 97 green alongside.
- Resolved: 2026-10-02.
