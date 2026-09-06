# iOS simulator device-verification of `origin/batch/wave-1-2` — 2026-09-06, Portuguese

- **Branch verified:** `origin/batch/wave-1-2` @ `eeea7a0` (checked out as `docs/wave-1-2-sim-pass`)
- **Worktree:** `/Users/pedropacheco1/Documents/Projetos/padel_app/levapp/.claude/worktrees/agent-a1373318bdc27a903`
- **Device:** iPhone 17 Pro Max simulator (`9F4BD843-89AA-4E45-A68F-E62AB2D612E2`), iOS 26.5, device language `pt-PT`
- **Build:** `npx expo prebuild -p ios --clean` + `npx expo run:ios` (code-signed Debug build; SecureStore works, login OK)
- **Backend:** Flask on **:5055** against a purpose-made Postgres DB **`levelup_sim`** (dropped at teardown). App pointed at it via `EXPO_PUBLIC_API_URL=http://localhost:5055/api` baked into the Metro bundle.
- **Metro:** verified serving THIS worktree (the :8081 owner's command line resolves to `…/worktrees/agent-a1373318bdc27a903/frontend/node_modules/@levelup/mobile/…`).
- **Screenshots:** `frontend/apps/mobile/appstore-screenshots/sim-pass-2026-09-06-pt/` (all native 1320×2868 = 3x), committed on `docs/wave-1-2-sim-pass`.
- **Did NOT take the web-servers lock** (ports 5000/5001/8080 and `levelup_test` untouched).

## Verdicts

| Item | Ticket | Verdict | Key screenshots |
|---|---|---|---|
| A | PAD-156 fonts | **PASS** | `A1-dashboard-pt.png`, `ABC-conversation-list.png`, `A-alertdialog-title.png`, `A-form-labels.png`, `A-login-form-labels.png`, `A-settings-section-titles.png` |
| B | PAD-157 dates | **PASS on every listed criterion, 3 locale leaks found** | `BD-calendar-quiet-week.png`, `ABC-conversation-list.png`, `B-calendar-en-no-restart.png`, `B-import-history-pt.png`, `B-club-pending-invites-pt.png`, `B-datepicker-month-locale.png`, `B-DEFECT-student-dashboard-english-dates.png` |
| C | PAD-158 strings | **FAIL** | `AC-chat-header.png`, `AC-class-detail-top.png`, `C-participant-row-absent.png`, `C-participant-confirmed.png` |
| D | PAD-172 week strip | **PASS** | `BD-calendar-quiet-week.png`, `D-calendar-busy-day.png`, `D-column-scrolled.png`, `D-empty-column-tap.png` |
| E | PAD-159 warnings | **PASS** | `E-overlap-dialog.png`, `E-edit-overlap-dialog.png`, `E-unavailable-student-dialog.png`, `E-unavailable-dismissed.png` |
| F | PAD-160 event detail | **FAIL** | `F-event-detail.png`, `F-event-edited-title.png`, `F-event-delete-confirm.png`, `F-DEFECT-oneoff-delete-noop.png`, `F-recurring-delete-scope.png` |
| G | PAD-161 eligibility | **PASS** | `G-eligibility-panel.png`, `G-attribute-select-open.png`, `G-attribute-changed-operation-reset.png`, `G-numberpad.png`, `G-rule-persisted.png`, `G-empty-state-after-remove.png` |
| H | PAD-151 reminder | **PASS** | `H-reminder-buttons.png`, `H-reminder-confirmed.png`, `H-late-cancel-warning.png` |
| I | Maestro | **PARTIAL** — `01-login` ×2 PASS; `21-event-detail` FAIL | `I-maestro21-delete-fails.png` |
| J | build 1.1.1 (5) metadata | **PASS** | (console output, no screenshot) |

---

## Details

### A. PAD-156 — font weights — PASS
Plus Jakarta Sans renders at real weights everywhere checked; nothing falls back to the system font.
- Section titles: `PRÓXIMA AULA · SEGUNDA-FEIRA`, `PRECISA DE TI · 17` (dashboard), `Elegibilidade`, `Histórico de importações`, `Convites pendentes` — all visibly heavier than the body text beside them.
- Card titles: `E2E Academy Class tem 5 vagas livres` (heavy) vs its `seg., 7 de set. · 10:00 · 1/6 inscritos` subtitle (regular). Settings rows: `Perfil` / `Preferências` / `Notificações` heavy vs their grey descriptions.
- Player names: `E2E Student` in ParticipantRow (`font-medium` → `PlusJakartaSans_500Medium`).
- **Unread vs read conversation row**: `E2E Student` (1 unread) renders clearly heavier/darker than `E2E Student Two` (read); the preview text follows suit — `ABC-conversation-list.png`.
- **AlertDialog title**: `Eliminar aula` on the class-delete dialog is Plus Jakarta bold, not SF Pro — `A-alertdialog-title.png`.
- **Form Label**: `Nome`, `Tipo`, `Data`, `Início`, `Fim`, `Máx. jogadores` on Nova aula and `Nome de utilizador` / `Palavra-passe` on the login screen render at Plus Jakarta Medium, heavier than their inputs/placeholders.

### B. PAD-157 — dates — PASS on every listed criterion, but 3 locale leaks found
Passing:
- Calendar weekday strip reads **SEG TER QUA QUI SEX SÁB DOM**; week label `31 ago–6 set`.
- Day header reads `domingo, 6 setembro` / `quarta-feira, 9 setembro` / `sexta-feira, 11 setembro`.
- Conversation timestamps: `16:05` (today) and **`Ontem`** (yesterday); the coach dashboard greeting header shows `domingo, 6 de setembro`.
- **Language switch to English re-renders live, no restart**: after `Definições › Preferências › English`, the calendar immediately reads `Calendar / Today / 7–13 Sep / MON TUE WED… / Friday, 11 September / 1 class`. The app was never relaunched — `B-calendar-en-no-restart.png`.
- Settings › Importar dados history entry: `23 de ago. de 2026, 14:30` (pt).
- Club invite expiry: `Expira a 13/09/2026` (pt day-first).
- Class detail dates `ter, 8 set`, `Até ter, 3 nov`; add-to-classes headers `SEGUNDA-FEIRA, 7 SET`, week label `7 set – 13 set 2026`.

**Defects found (not blockers, but PAD-157 gaps):**
1. **Student dashboard "As tuas próximas aulas" renders dates in English while the app is pt** — `Mon 7 Sep · 10:00`, `Tue 8 Sep · 14:00`, `Wed 9 Sep · 08:00`. Evidence: `B-DEFECT-student-dashboard-english-dates.png`. (The coach dashboard's equivalent list is correctly `seg., 7 de set.`)
2. **The app's own date-picker wheel shows English month names** (`September`, `October`, `November`…) on a pt device with the app in pt, even though its own buttons are `Concluído`/`Cancelar`. Evidence: `B-datepicker-month-locale.png`.
3. **Recurrence weekday chips are English initials** `M T W T F S S` on the pt new-event form (pt would be `S T Q Q S S D`).

### C. PAD-158 — Portuguese strings — **FAIL** (2 defects)
Passing: class-detail attendance buttons/badges are pt (`Presente`, `Ausente`, `Justificada`, `Injustificada`, `Confirmar presenças`, `Presença confirmada`, `Lembrete enviado`); the conversation-list role chip reads **`Jogador`**; the recurring line reads **`Aula recorrente · até ter, 3 nov`**. **String fit: `Injustificada` and `Presença confirmada` both render on one line with no truncation or overflow** (`C-participant-row-absent.png`, `C-participant-confirmed.png`).

**FAIL 1 — the chat header role badge still shows the raw English enum.**
Viewing a conversation as the coach the badge reads **`Player`**; as the student it reads **`Coach`** (`AC-chat-header.png`, `H-reminder-buttons.png`). Expected `Jogador` / `Treinador`.
Root cause: `frontend/apps/mobile/app/conversation/[id].tsx` has two headers. Commit `62903bf` applied the `roleLabelKey` fix to the `Stack.Screen options.headerTitle` block (line ~635) — **which is dead code, because the same options set `headerShown: false`** (line 626). The header actually on screen is the custom navy one at lines 577–598, and it still renders:

```tsx
<Text className="text-[11px] font-semibold capitalize" …>
  {conversation.participantRole}      // raw backend enum + CSS capitalize → "Player"
</Text>
```

This is the exact criterion PAD-158's follow-up claimed to fix, so it is a regression against its own PR body.

**FAIL 2 — the class-detail participants heading is hardcoded English.**
`Participants (1/6)` on every class detail screen (`AC-class-detail-top.png`, `C-participant-confirmed.png`).
`frontend/apps/mobile/app/class/[id].tsx:780` renders the literal `Participants ({participants.length}/{maxPlayers || "—"})` even though `calendar.detail.participants` (= `Participantes`) and `calendar.detail.participantsCount` exist in **both** locales. PAD-158's "sweep of the rest of apps/mobile for user-visible English … finds nothing left" missed it.

### D. PAD-172 — week strip — PASS
- **Quiet week** (31 ago–6 set, 0 classes): measured on `BD-calendar-quiet-week.png`, the area below the week-nav row splits **50.5% strip / 49.5% day list**.
- **Busy week** (7–13 set with a 12-entry Wednesday): the same split is held exactly — the strip does not grow (`D-calendar-busy-day.png`).
- **A day with >4 classes scrolls inside its own column**: swiping inside the Wednesday column scrolled it from `Aula Manha 1…Aula Tarde 2` to `Aula Manha 2…Aula Noite` with the strip height unchanged and the day list untouched. **No `+N` overflow chip anywhere** (`D-column-scrolled.png`).
- **Tapping the empty lower half of a class-free column selects that day**: a tap at 45% screen height in the empty Friday column selected Fri 11 (`sexta-feira, 11 setembro`) — `D-empty-column-tap.png`.
- **The scroll gesture does not swallow the tap**: the day-select tap immediately following a column scroll registered normally.

### E. PAD-159 — overlap / unavailable warnings — PASS
- **Create overlapping class** → `Horário sobreposto` / "Já tem um evento neste horário. Tem a certeza que pretende avançar com a marcação?" / `Avançar mesmo assim` / `Cancelar`. **Cancel** returns to the form untouched; **confirm** creates the class (`Aula Sobreposta` appeared on Mon 7 Sep). `E-overlap-dialog.png`, `E-overlap-confirmed-created.png`.
- **Edit a class's time onto another** (E2E Pending Confirm Class moved 18:00 → 10:00, colliding with E2E Academy Class 10:00–11:00) → the same pt dialog; cancel and confirm both work and the save lands. `E-edit-overlap-dialog.png`, `E-edit-overlap-saved.png`.
- **Add-to-classes for a student with an availability blocker on that slot** → `Aluno indisponível` ("O aluno E2E Student marcou-se como indisponível nesta hora…") renders **layered above the still-open Adicionar-a-aulas dialog** (`E-unavailable-student-dialog.png`); `Cancelar` dismisses only the top dialog and leaves the add-to-classes dialog interactive (`E-unavailable-dismissed.png`); `Avançar mesmo assim` completes the add and closes both.

### F. PAD-160 — event detail — **FAIL** (one-off delete is broken)
Passing:
- Tapping a personal/blocker event **in the day list** opens the detail screen (`F-event-detail.png`) — the PAD-160 regression itself is fixed.
- **Edit title → save shows the NEW title immediately** and the old one is gone — no stale `["calendar-block", id]` cache (`F-event-edited-title.png`, and the patched Maestro flow asserted `assertNotVisible: "Maestro Test Event$"` right after save).
- The one-off delete confirm renders **real pt copy** — `Eliminar evento` / "Este evento será eliminado permanentemente." — no `calendar.scope.delete` / `calendar.eventDetail.*` key paths (`F-event-delete-confirm.png`).
- A **recurring** event's delete does offer the scope choice: `Apenas esta aula` / `Esta e todas as aulas futuras` / `Cancelar`, and choosing "Apenas esta aula" really deletes the occurrence (`Evento eliminado` toast, navigates back) — `F-recurring-delete-scope.png`, `F-recurring-delete-single-result.png`.

**FAIL — deleting a NON-recurring event does nothing.** Confirming shows the error toast **`Falha ao eliminar o evento`**, the screen stays on the detail, and the row is still in `calendar_blocks`. Reproduced three times, including inside the official Maestro flow.

Root cause (traced end to end):
- `app/event/[id].tsx:178` → `useRemoveEvent()` → `src/features/calendar/hooks.ts:126`:
  ```ts
  calendarApi.deleteCalendarBlock(blockId, scope ? { occDate: occDate ?? "", scope } : undefined)
  ```
  For a one-off, `scope` is `undefined`, so `options` is `undefined`.
- `packages/api/src/resources/calendar.ts:23` → `getApi().delete(url, { data: undefined })` → axios sends **no body and no `Content-Type`**.
- The backend then returns **415 Unsupported Media Type**. Verified directly against the running API:
  ```
  DELETE /api/app/calendar_block/4  (no body)                                    → 415, row NOT deleted
  DELETE /api/app/calendar_block/1  -H 'Content-Type: application/json' -d '{}'  → 204, row deleted
  ```
  The recurring path works only because it always sends `{occDate, scope}`.

Fix is a one-liner on either side (always send `options ?? {}` from the client, or make the Flask handler tolerate a bodyless DELETE). **This is the only functional regression in the batch besides the C string defects.**

Also worth flagging (cosmetic): the recurring-event scope dialog is **class-worded** — `Eliminar aula` / "Que aulas pretende eliminar?" / "Apenas esta aula" — for a *personal event*. `app/event/[id].tsx:486-488` explicitly comments that `calendar.scope.*` is class-worded and gives the one-off dialog its own `calendar.eventDetail.*` copy, then reuses `ClassScopeDialog` unchanged for the recurring case.

### G. PAD-161 — eligibility panel — PASS
`Definições › Notificações` shows `Motor de convites automáticos` with the `Elegibilidade` block and the empty state "Sem regras definidas — todos os teus alunos são elegíveis para todas as aulas."
- `+ Adicionar regra` adds a rule row.
- The attribute Select **opens** (options `Nível`, `Faltas injustificadas`, `Faltas justificadas`, `Taxa de presença`) and **closes** on selection.
- Changing the attribute (`Nível` → `Faltas injustificadas`) **resets the operation** (to `menos de`) and clears the value.
- Tapping the value field brings up the **numeric keypad**.
- Leaving Settings (Calendar tab) and reopening `Definições › Notificações` shows the rule still there; the backend row confirms it: `notification_configs.eligibility_rules = [{"attribute":"unjustified_absences","operation":"less_than","value":3}]`.
- Removing the last rule returns the empty state and writes `eligibility_rules = null`.

### H. PAD-151 — attendance reminder — PASS
Signed in as `e2e-student`:
- A `notification_reminder` message renders **`Sim` / `Não`** buttons (`H-reminder-buttons.png`) — the PAD-151 gap is closed.
- Tapping **`Sim`** flips the message to the confirmed state — badge **`Confirmado`** plus a `Cancelar presença` affordance — and the backend replied with its own message ("Boa, até já! 🎾").
  *Wording note:* the chat-bubble badge is `Confirmado`; `Presença confirmada` is the ParticipantRow badge on the coach's class detail, verified separately under item C. Both are pt.
- A **late cancel warns first**: on a reminder whose `cancellationDeadline` has passed, `Cancelar presença` shows "⚠ O prazo de cancelamento já passou. Ainda podes cancelar, mas isto conta como um cancelamento tardio." with `Cancelar presença` / `Não` (`H-late-cancel-warning.png`).
- Reminder fixtures were inserted directly into `messages` (the coach's "Lembrar" button reported `Lembretes enviados a 0 alunos` because the seeded presence was already confirmed).

### I. Maestro — PARTIAL
- **`01-login.yaml` run twice back-to-back with no DB reset and no app reinstall: both PASS**, all three sections (coach login, wrong password, student login). PAD-154 regression is fixed.
- **`21-event-detail.yaml` (first ever run): FAIL.** Two independent problems, one in the flow and one in the app:
  1. **The flow is wrong.** It fails here:
     ```
     Assert that "Maestro Test Event" is visible... COMPLETED
     Tap on "Maestro Test Event"... COMPLETED
     Assert that id: event-detail is visible... FAILED
     ```
     `- tapOn: "Maestro Test Event"` is ambiguous: after PAD-172 the **week-strip chip** for that event carries the same text and is the first match, and tapping a strip chip only *selects the day* (by design — rule 14 makes the whole column a day-select target). The day-list card is the second match. Changing that one step to `tapOn: {text: "Maestro Test Event", index: 1}` makes the tap land correctly and the flow proceeds. Recommended fix: use `index: 1`, or give the day-list `EventCard` its own testID and target that.
  2. **The app is wrong too.** With the selector patched, the flow runs all the way through create → open → edit → save → delete-copy assertions (**all COMPLETED**, including `assertNotVisible: "Maestro Test Event$"` and the three raw-key-path assertions) and then dies on the delete:
     ```
     Tap on id: event-delete-confirm... COMPLETED
     Assert that id: screen-calendar is visible... FAILED
     ```
     That is the 415 bug from item F. `I-maestro21-delete-fails.png` shows the app still sitting on `Maestro Test Event Edited` after the delete was confirmed.
     So even after the selector is fixed, **flow 21 cannot go green until the one-off delete is fixed** — and it also will not clean up after itself, contradicting its "SELF-CONTAINED" header comment.
- No other Maestro flows were run.

### J. Build 1.1.1 (5) metadata — PASS
On this branch:
```
> @levelup/mobile@0.1.0 prebuild:ios
> expo prebuild -p ios --clean
✔ Finished prebuild
✔ Installed CocoaPods
PREBUILD_EXIT=0

> @levelup/mobile@0.1.0 verify:splash
> bash scripts/verify-native-splash.sh
OK: native launch screen is generated from the current splash asset.
VERIFY_SPLASH_EXIT=0
```
PR #35's guard fix (looking for `ios/LevApp` rather than `ios/LevelUp`) works — `app.json` is `version 1.1.1`, `ios.buildNumber "5"`, bundle id `com.padellevelup.app`.

---

## Summary of defects to fix before shipping

| # | Severity | Ticket | Defect |
|---|---|---|---|
| 1 | **Blocker** | PAD-160 | One-off (non-recurring) calendar-event delete fails with 415 — `deleteCalendarBlock` sends no request body when `scope` is undefined. Also blocks Maestro `21-event-detail`. |
| 2 | **Blocker** | PAD-158 | Chat header role badge shows the raw enum (`Player` / `Coach`). The fix landed on a `headerTitle` block that is dead because `headerShown: false`. |
| 3 | High | PAD-158 | `app/class/[id].tsx:780` hardcodes `Participants (n/m)` in English; `calendar.detail.participants(Count)` exist in both locales. |
| 4 | Medium | Maestro | `21-event-detail.yaml`'s `tapOn: "Maestro Test Event"` is ambiguous with the week-strip chip; needs `index: 1` or a card testID. |
| 5 | Medium | PAD-157 | Student dashboard "As tuas próximas aulas" prints English dates (`Mon 7 Sep`) on a pt app. |
| 6 | Low | PAD-157 | The in-app date-picker wheel prints English month names. |
| 7 | Low | PAD-157/158 | New-event recurrence weekday chips are English initials (`M T W T F S S`). |
| 8 | Low | PAD-160 | The recurring-event delete reuses the class-worded `ClassScopeDialog` ("Eliminar aula") for a personal event. |

Nothing in items A, D, E, G, H or J needs work.

---

## Setup notes that would save the next person time

1. **Do not take the web-servers lock for a simulator pass.** A dedicated DB + a spare port is enough and never blocks the other agents:
   - Copy `frontend/apps/web/e2e/scripts/reset-test-db.sh` into scratch, but **rewrite its paths as absolutes** — the original derives `BACKEND_DIR` from `dirname $0`, so a copy outside `e2e/scripts/` breaks immediately. Change `DB_NAME` to `levelup_sim`.
   - Run Flask from `<worktree>/backend` with the shared `.venv` symlinked in: `POSTGRES_DB=levelup_sim FLASK_APP=padel_app FLASK_ENV=development flask run --port 5055`.
   - Point the app at it with **`EXPO_PUBLIC_API_URL=http://localhost:5055/api` exported in the shell that starts Metro** (`apps/mobile/src/lib/config.ts` reads it, and Metro inlines `process.env.EXPO_PUBLIC_*` at transform time — repointing the API needs a Metro restart, not a rebuild).
2. **Budget ~25 min for the build.** `expo prebuild -p ios --clean` + pod install + `expo run:ios` on cold DerivedData took ~22 minutes. The old `LevApp.app` bundles in DerivedData are from Aug 21, before the autolinking pins landed — not worth trying to reuse.
3. **Node 24 + `EXPO_NO_DEPENDENCY_VALIDATION=1`**: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` (the shell default is Node 18 and breaks the mobile toolchain).
4. **Simulator language**: `xcrun simctl spawn <udid> defaults write -g AppleLanguages -array pt-PT pt` **before first launch** works and the app picks pt up on its own. But the seed writes `language="en"` on every user, so also `UPDATE users SET language='pt';` — the app's stored preference wins over the device.
5. **Drive the app with throwaway Maestro flows, not free-form tapping.** Put them in `apps/mobile/.maestro/adhoc/` so `runFlow: ../subflows/login-coach.yaml` and `runScript: ../scripts/*.js` still resolve. `takeScreenshot: /abs/path/name` works and writes device-resolution (3x) PNGs. Gotchas hit:
   - `tapOn: "<text>"` is ambiguous on the calendar: the **week-strip chip matches before the day-list card**. Use `tapOn: {text: "…", index: 1}` or a point tap.
   - Controls that set an `accessibilityLabel` (ParticipantRow's Presente/Ausente, the eligibility select options) are **invisible to `tapOn: "<visible text>"`** — the label replaces the text in the a11y tree. Use the testID or a point tap.
   - `hideKeyboard` fails on this build; dismiss with a tap on empty chrome instead. An open keyboard silently swallows tab-bar taps.
   - Select portals: options only exist after tapping the trigger (`settings-language-select`, `eligibility-attribute`), and their testIDs are not reachable — tap the option by point.
   - Screens pushed on the stack (chat, player detail, class detail) hide the tab bar, so `tapOn: id: tab-*` fails until you go back. Re-running `../subflows/login-coach.yaml` is the cheapest reliable reset (it logs out through Settings and back in).
6. `settings-nav-<sectionId>` is the testID for the Settings section rows (`settings-nav-notifications`, `settings-nav-preferences`, `settings-nav-import`, `settings-nav-club`) — the bare `settings-preferences` / `settings-auto-invite` ids in the codebase are on the *content*, not the nav row.
7. Hand-seeding rows is fine, but two columns are JSON-shaped and will 500 the API if you get them wrong: `bulk_imports.summary` must be a JSON object (e.g. `{"Players": 3}`), and a raw-SQL recurring `calendar_blocks` row is not expanded by `/app/calendar` the way one created through the UI is — create recurring events through the app.
8. Teardown used: kill the :5055 Flask and the :8081 Metro (the `expo run:ios` parent), `xcrun simctl shutdown all`, `DROP DATABASE levelup_sim`.
