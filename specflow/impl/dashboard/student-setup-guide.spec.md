---
id: dashboard.student-setup-guide
status: draft
depends_on: [dashboard.blocks, dashboard.profile-completeness, calendar.student-blockers, notifications.request-alerts, messaging.push-notifications, auth.push-subscription, players.join-token, settings.profile, settings.role-scope, classes.availability]
serves: [P-DASHBOARD-2]
governed_by: []
---

# dashboard.student-setup-guide

### Intent
PAD-839. When a student signs in (web, iOS, Android), LevApp walks them through five steps that
decide whether invitations, reminders and presence requests reach them. Each finished step is worth
`const:SETUP_GUIDE_STEP_WEIGHT`. The student can do it all now, leave it for later, or hide it for
good. Step 3 brings a new editor for unavailable hours ("Editor de horário") that writes ordinary
`calendar.student-blockers` rows.

Design reference: "Onboarding do aluno.html" on PAD-839 (11 canvas pages, saved locally at
`docs/plans/profile/pad-839/design/`). The canvas page titles ("Passo 1 – Ligar a um treinador", …)
are old page names. The sheet's list and each screen's "Passo N de 5" follow the ticket's order,
which this spec uses (`const:SETUP_GUIDE_STEPS`). Where the design's script and this spec differ on
behaviour, the spec holds. The design holds on look.

### Entities
- **User** (new columns, migration in `CHANGES.md`; all nullable, no backfill):
  - `setup_guide_snoozed_at` DateTime (naive UTC): the instant of the last "Agora não" or other
    close of the sheet (rule 4). *(OQ-11)*
  - `setup_guide_hidden_at` DateTime: "Não mostrar mais". *(OQ-11)*
  - `setup_guide_ready_closed_at` DateTime: "Conta pronta" closed. *(OQ-11)*
  - `setup_always_available_at` DateTime: "Estou sempre disponível". *(OQ-11)*
  - `setup_alerts_confirmed_at` DateTime: the student pressed "Ativar notificações" in step 1.
    *(OQ-8 assumption (b), OQ-11)*
- **CalendarBlock**: new nullable `schedule_id` String(36), indexed
  (`ix_calendar_blocks_schedule_id`, declared on the model too). It groups the rows one editor save
  writes (rule 10). NULL for every row made elsewhere.
- **READS:** `GET /api/auth/me` (`requestAlerts`, `coaches` with their new `level` and `side`, the
  new `setupGuide`), `GET /api/app/availability_blockers` (with the new `scheduleId`), the
  `profile_incomplete` block of `GET /api/app/dashboard`, and the device's push permission.
- **WRITES:** `PATCH /api/auth/me` (`requestAlerts`, the new keys), availability schedules (rule 10),
  `POST /api/app/profile-reminder`.

### Rules
1. **A client-side guide, no new dashboard block.** Both shells work out the guide from data they
   already fetch: `/auth/me`, the blockers list, the `profile_incomplete` block and the device's
   permission. One pure function in `@levelup/config`, `setupGuideState(input)`, returns each
   step's state, the count, the percent, the next pending step and which surfaces show. Both
   shells call it, and neither re-derives any part of it.
   *Why:* every done signal already exists on the client. Step 2 can only be read on the device, so
   a server block could not compute it anyway. Builds already in the App Store never see a new
   block type, so no capability token is needed (`dashboard.profile-completeness` rule 5 shows what
   such a token costs). The cost is one more `GET /availability_blockers` when the student
   dashboard mounts, on both shells.
2. **Percent.** `percent = doneCount × const:SETUP_GUIDE_STEP_WEIGHT`, and the text reads
   "N de 5 passos · X%". The 5-part bar is green for a done step, blue for the current step (the
   first pending one, in order) and grey for the rest.
3. **When each step is done.** The steps are listed in `const:SETUP_GUIDE_STEPS`. Each step is
   `done`, `pending` or `unknown` (rule 3a).
   1. `request_alerts`: `me.requestAlerts === true` AND `setupGuide.alertsConfirmed`. *(OQ-8
      assumption (b).)* The flag defaults ON, so ON alone says nothing about the student. The step
      is done once they confirm it in the guide, and it is undone if they later switch the alerts
      off in Settings.
   2. `device_push`: this device's permission is granted (rule 7). *(OQ-9: per device, never synced.)*
   3. `unavailability`: the student has at least one availability blocker with an occurrence on or
      after the club local today (a one-off dated today or later, or a recurring one whose
      `recurrenceEnd` is today or later or null), OR `setupGuide.alwaysAvailable`. This is worked
      out live: deleting the last such block, or its end passing, undoes the step unless "Estou
      sempre disponível" is set.
   4. `coach_link`: `me.coaches.length > 0`. A student who signed up through a coach's link
      (`players.join-token`) or claimed an invitation is linked by the time the dashboard first
      loads, so the guide opens with this step done.
   5. `profile`: `me.coaches.length > 0` AND the loaded dashboard carries no `profile_incomplete`
      block, meaning every active coach has set level and side (`dashboard.profile-completeness`
      rules 1, 4). *(OQ-10 assumption: ALL coaches.)* With no coach the step is pending, and its
      screen sends the student to step 4.
3a. **Loading never reads as done.** A step is `unknown` until every source it reads has answered:
    `/auth/me` for steps 1, 3, 4 and 5, the blockers list for step 3, the dashboard payload for
    step 5, and the device permission for step 2. A source that failed keeps its steps `unknown`.
    While any step is `unknown`, the sheet does not open, the card and the avatar ring show a
    skeleton bar with no number, and "Conta pronta" never shows. *Why:* an absent
    `profile_incomplete` block or an empty blockers list while loading would otherwise read as done.
    A student with four steps done would then see "Conta pronta" flash, and "Fechar" is permanent.
    A student with no player row (the blockers route answers 403, `frontend_api.py:1879`) is not a
    student for the guide, which never shows to them.
4. **Where it shows** (student role only; all five steps known, rule 3a):
   - **The sheet** "Prepara a tua conta" (`setup-guide-sheet`) opens on the dashboard when
     `percent < 100`, the guide is not hidden, and the sheet is not snoozed. It holds the bar, the
     five steps (done ones marked "Feito"), "Começar · 2 minutos" (`setup-guide-start`), "Agora
     não" (`setup-guide-later`), "Não mostrar mais" (`setup-guide-hide`) and the line "Encontras
     sempre este guia em Perfil › Configurar conta".
   - **Snoozed** means the club local date of now is not after the club local date of
     `setupGuide.snoozedAt`. Both dates are Europe/Lisbon calendar dates (`club-local-day`), taken
     with `lisbonNow` (`@levelup/config` `club-date.ts`), never from a UTC midnight. The sheet
     returns on the first open after the next Lisbon midnight
     (`const:SETUP_GUIDE_SNOOZE_CLUB_DAYS`).
   - **Closing the sheet in any way except "Não mostrar mais"** ("Agora não", "Começar", a swipe or
     the backdrop) snoozes it: `PATCH /api/auth/me {setupGuideSnooze: true}`, and the server stores
     its own `now` in `setup_guide_snoozed_at`. *Decision:* "Começar" counts too, otherwise a
     student who leaves a step halfway gets the sheet again on every dashboard open.
   - **The compact card** (`setup-guide-card`) shows "CONFIGURAR CONTA · N DE 5", the percent, the
     bar, "A seguir: {next step}", "Continuar" (`setup-guide-continue`) and "Ver os 5 passos"
     (`setup-guide-all`, which opens the sheet's list and writes nothing until the student
     closes it, under the rule above). It sits at the top of the student dashboard, before the
     `profile_incomplete` card, whenever `percent < 100` and the guide is not hidden. "Continuar",
     or a tap on the card, opens the next pending step.
   - **"Não mostrar mais"**: `PATCH /api/auth/me {setupGuideHidden: true}`. The sheet, the card, the
     avatar ring and the "Conta pronta" card all go away, on every device. The guide stays reachable
     from Perfil › Configurar conta (`settings-setup-guide`), a row inside the Profile section shown
     to students only (`settings.role-scope`), on both shells.
   - **The avatar ring** (`setup-guide-ring`): while the card would show, the account avatar
     carries a ring filled to `percent`. That avatar lives in the shared layout (web
     `components/layout/AppLayout.tsx` header, iOS `app/(tabs)/_layout.tsx`), so the ring shows on
     every screen with that avatar, for a student only, never for a coach.
   - **"Conta pronta"** (`setup-guide-ready`): when `percent === 100`, the guide is not hidden and
     `readyClosed` is false, a green card "Conta pronta · 5 de 5" with "Fechar"
     (`setup-guide-ready-close`) shows in place of the compact card. "Fechar" sends
     `PATCH /api/auth/me {setupGuideReadyClosed: true}`. After that no guide surface shows again,
     even if a step is later undone. *Decision:* "appears once" means "until closed", stored on
     the account so it is once across devices. Showing it on a single render would lose it to a
     refresh.
5. **Moving through the steps.** Each step is a full screen with "Passo N de 5" and "Saltar" at the
   top (`setup-step-skip`; not on step 5). At the bottom it has the step's own "leave" button
   (`setup-step-later`): "Agora não" on steps 1–3, "Faço isto depois" on step 4, and "Terminar por
   agora" / "Ir para o Painel" on step 5. The leave button returns to the dashboard and writes
   nothing (the sheet was already snoozed when the guide opened). Opening the guide, or finishing
   or skipping a step, goes to the next pending step after it, in order. Done steps are skipped,
   and past the last one the guide returns to the dashboard. Skipping never marks a step done and
   writes nothing.
6. **Step 1, "Ativar notificações na LevApp".** The screen lists what the student will get: slot
   invitations, reminders before class, presence confirmations, and the coach's answers to their
   requests. "Ativar notificações" (`setup-alerts-enable`) sends `PATCH /api/auth/me
   {requestAlerts: true, setupGuideAlertsConfirmed: true}` straight away, with no Settings save
   button (`settings.explicit-save` governs Settings only). Then each shell updates its own copy
   of `/auth/me`. Web calls `refreshUser()` (`auth/AuthContext.tsx`), and its Settings page
   re-reads `getMe()` on mount. iOS writes the answer with `writeAuthMe(queryClient, answer)`
   (`features/settings/write-auth-me.ts`) and calls `refreshUser()` (`src/auth/AuthContext.tsx`).
   Every other guide PATCH (rules 4, 8) updates the session the same way.
7. **Step 2, "Permitir notificações no telemóvel".** `deviceStepState(platform, permission,
   subscribed)` in `@levelup/config` gives one state per case:
   - iOS / Android: `undetermined` → `ask` ("Permitir notificações", asks the system: **OQ-C**);
     `denied` → `open_settings` ("Abrir Definições", `Linking.openSettings()` as
     `notifications-blocked-banner` does, with "Abre Definições › LevApp › Notificações e liga
     Permitir notificações." on iOS, or "Abre Definições › Apps › LevApp › Notificações e liga as
     notificações." on Android); `granted` → `done`.
   - Web on a computer (`usePushNotifications`): `default` → `ask` (**OQ-C**); `denied` →
     `padlock` ("Clica no cadeado ao lado do endereço e muda Notificações para Permitir." with "Já
     mudei, verificar", which reads the permission again); `granted` and subscribed → `done`;
     `granted` but not subscribed → `ask`, which subscribes without a prompt; no Push API
     (`isSupported` false, `usePushNotifications.ts:26`) → `unsupported` (never done, the student
     can only skip).
   - Web on an iPhone or iPad outside an installed web app → `ios_browser` ("Instala a app para
     receberes avisos", "No navegador do iPhone não há notificações", "Obter na App Store"; never
     done). Nothing detects this today. A new `isIosBrowserWithoutApp()` in web
     `utils/pushNotifications.ts` decides it (an iOS user agent, including iPadOS reporting as a
     Mac with touch, and neither `navigator.standalone` nor `display-mode: standalone`).
   - Titles: "Permite notificações no iPhone" / "… no Android" / "Permite notificações no
     navegador".
   - **Blocked by OQ-C:** the `ask` state's prompt contradicts `messaging.push-notifications`
     rule 15 and `auth.push-subscription` rule 4. Criterion 8 waits for the owner. Every other
     state does not prompt, so it does not wait.
8. **Step 3, "Definir indisponibilidade".** The screen offers the presets in
   `const:SCHEDULE_PRESETS`, picked with one tap (`setup-preset-<key>`). A preview reads "VAI FICAR
   GUARDADO · {name} · Recorrente · {days} · {hours}". The screen also has:
   - "Editar" on the selected preset or saved schedule;
   - "+ Criar o meu horário";
   - "Guardar e continuar" (`setup-unavailability-save`), which saves the selected preset as a
     schedule (rule 10) and moves on;
   - "Estou sempre disponível" (`setup-always-available`), which sends `PATCH /api/auth/me
     {alwaysAvailable: true}` and moves on.

   If the student has a guide-made schedule (rows with a `scheduleId`), the newest one is shown
   selected, with "Editar".
9. **The schedule editor** (`schedule-editor`, a bottom sheet titled "O meu horário", or "Editar
   bloqueio" when editing). The logic lives once in `@levelup/config/availability-schedule.ts`,
   and each shell renders it.
   - **Model**: a day is 48 half-hour slots, from 00:00 to 24:00. A period is a run of busy slots
     `[start, end)`. Periods are always the runs of the slots, so periods that overlap or touch
     are one period. The design's day order is Seg … Dom. Rows store JS `getDay` (0 = Sunday), and
     the module maps between the two.
   - **Type**: a segmented control, "Igual todos os dias" (the default) or "Varia por dia".
   - **Days** (`schedule-day-<n>`, `n` = JS `getDay`): seven round buttons, Seg … Dom, blue when
     chosen. In "Igual" they toggle, and the shortcuts "Todos", "Dias úteis" and "Fim de semana"
     set exactly those days. The section is titled "DIAS", or "ESCOLHE O DIA A EDITAR" in "Varia".
   - **Grid** (`schedule-hour-<HH>`): hours `const:SCHEDULE_GRID_FIRST_HOUR` to
     `const:SCHEDULE_GRID_LAST_HOUR` in `const:SCHEDULE_GRID_COLUMNS` columns, titled "HORAS
     OCUPADAS", or "HORAS OCUPADAS · {DIA}" in "Varia". Hour `h` means the slots `[h:00, h+1:00)`.
     - **A tap with no start pending:** on an hour fully busy (both halves), it frees that hour,
       splitting its period. On any other hour (free, half busy, or the "LIVRE" end hour), it marks
       the hour as the start, with a strong blue outline.
     - **A tap while a start is pending:** taps on two different hours `a` and `b` fill
       `[min(a, b), max(a, b))` (the later hour is where the student is free again). A second tap
       on the same hour `h` fills `[h, h+1)`. The start mark then clears.
     - **Cell looks:** a fully busy hour is pastel blue with a light-blue border. A half-busy hour
       is lighter, with a dashed border. The hour right after a period that ends on the hour is
       white, with a dashed border, a light-blue left stripe and "LIVRE" under the number.
     - **Hint** (`schedule-hint`, step number and text): with no period, "1 · Toca na hora em que
       começas a estar ocupado."; while a start is pending, "2 · Agora toca na hora em que ficas
       livre."; otherwise "3 · Toca noutra hora para juntar outro período."
     - **"Limpar"** (`schedule-clear`), shown when the day has a period, empties the day in view.
     - **Hours outside the grid:** the parts of periods before `const:SCHEDULE_GRID_FIRST_HOUR`
       are not drawn on the grid. They show in the periods list and in "A tua semana", and are
       edited there with − / +.
   - **Periods** (`schedule-period-<i>`), under "PERÍODOS · AFINA DE 30 EM 30 MIN": each reads
     "HH:MM – HH:MM" and its length ("2 h", "4 h 30"). It has − / + on "Começa" and on "Acaba",
     in `const:SCHEDULE_STEP_MINUTES` steps, and × to delete it.
     - Start − needs a start above 00:00. End + needs an end below 24:00.
     - Start + and end − need the period to stay at least one step long.
     - A period that grows into its neighbour merges with it.
     - **24:00 and `const:SCHEDULE_DAY_END`:** the model's slot 48 (24:00) is stored as
       `const:SCHEDULE_DAY_END` and read back as 24:00, so "−" on that end gives 23:30. A stored
       time that is not on a 30-minute boundary (a row edited on the Disponibilidade tab, e.g.
       05:15) is widened to the slots around it when the editor reads it: the start rounds down
       and the end rounds up. *Decision:* a block only ever grows, so an invitation never slips
       through. The editor then saves the widened times.
   - **"Varia por dia"**:
     - Switching from "Igual" copies the shared periods to every chosen day, and opens the first
       chosen day.
     - Switching back to "Igual" takes the open day's periods as the shared ones, and every day
       with any period as the chosen days.
     - The day buttons become tabs: the open one is blue, and a day with periods shows a dot.
     - "Copiar {dia} para…" (`schedule-copy`) lets the student pick other days (not the open one)
       and replaces their periods with the open day's on "Copiar".
     - "A TUA SEMANA" lists 7 rows (`schedule-week-<n>`), each with a 24-hour bar of its periods
       and a text: hours joined by " · ", as "09–11 · 15–20" (a half hour reads "13:30"), or
       "Livre". Tapping a row opens that day.
   - **Name** (optional, "NOME (OPCIONAL)"): the chips `const:SCHEDULE_NAME_SUGGESTIONS`, at most
     one. Tapping the chosen chip clears it. The design has no free-text field. The name is
     stored in each row's `title`, the student's private "Motivo" (`calendar.student-blockers`
     rule 8: never shown to a coach).
   - **Summary** (`schedule-summary`), from `scheduleSummary(schedule)`:
     - The sentence reads "Não recebes convites nem lembretes {days}, {hours}."
     - {days} is "todos os dias", "de segunda a sexta", "ao fim de semana", "à {dia}" or "ao
       sábado|domingo" for one day, else "à seg, ter e qua" (short names).
     - {hours} is "das 09:00 às 11:00", joined by ", " with a last " e ".
     - With nothing chosen it reads "Escolhe os dias e toca nas horas em que estás ocupado.", with
       no days "Falta escolher os dias.", and with no hours "Falta marcar as horas ocupadas.".
   - **Save** (`schedule-save`, "Guardar horário", or "Guardar alterações" when editing) is enabled
     only when, in "Igual", at least one day and one period are chosen, or, in "Varia", any day
     has a period. "Apagar bloqueio" (`schedule-delete`) shows only when editing a saved
     schedule. "Cancelar" (`schedule-cancel`) closes and writes nothing.
10. **From editor to rows.** A schedule is stored as `CalendarBlock` rows, one time interval each.
    `scheduleToBlockerInputs(schedule, {startDate, endDate})` in `@levelup/config` makes, for each
    distinct interval `(start, end)`, ONE weekly recurring row whose `daysOfWeek` is every chosen
    day that has that interval. So "Igual" with k periods on D days gives k rows, each on D.
    "Varia" gives one row per distinct interval across all days, each on the days that share it.
    - `blockersToSchedule(rows)` reads every row carrying one `scheduleId`, as the list returns
      them now (tab edits included), and gives that week back. The editor opens prefilled from
      it. The rows do not store the mode: the editor opens in "Igual" when every day that has
      periods has the same periods, and in "Varia" otherwise. The name shown is the newest row's
      title, and saving writes it on every row.
    - Every row of one save carries the same `schedule_id`. The rows are written by a new
      student-only endpoint pair (`calendar.student-blockers` rule 18).
      `PUT /api/app/availability_schedules/<id> {title, blockers: [BlockerInput…]}` replaces every
      row with that `schedule_id`, and creates them when there are none (the client makes up the
      id, a UUID). It answers the rows written. `DELETE /api/app/availability_schedules/<id>`
      removes them all.
    - The PUT is **one unit of work**. Every row is checked first, like a single
      `POST /availability_blockers`. Then the old rows are deleted and the new ones written,
      `type="unavailable"` and `blocks_auto_invitations=true` set before the one commit (not the
      per-row commit and second `save()` of `create_student_blocker`). If one row is refused, the
      answer is 400 and no row changes, old or new.
    - *Why not group by title:* the name is optional and not unique. *Why not the description:*
      that would hide a structural key inside a free-text field.
    - **Start date** is the club local today. **End date** follows `calendar.student-blockers`
      rule 16 (today: start + 3 months). **Blocked by Q7**, see Open questions. No criterion here
      depends on the outcome.
    - The 30-minute − / + needs no model change: rows hold `HH:MM` times.
11. **The Disponibilidade tab is unchanged.** Rows a schedule wrote are listed there one by one, like
    any other block, and can be edited or deleted there one by one (`calendar.student-blockers`
    rules 14–17).
    - A tab edit keeps the row's `schedule_id` while the row still recurs. An edit that makes it a
      one-off clears its `schedule_id`, so every row of a schedule is weekly and the editor can
      show it.
    - A tab delete of the whole row removes it from the schedule.
    - Deleting one occurrence (or "this and following") splits the row. The continuation keeps
      `schedule_id` (`calendar.student-blockers` rule 18).
    - *Decision:* the ticket puts the editor only in the guide. Grouping schedules on the tab is
      OQ-G.
12. **Step 4, "Ligar a um treinador".** The text says that a coach's link, opened on this phone,
    links the student automatically. "Ligar-me a um treinador" (`setup-connect`) opens the existing
    flow (web `/connect`, iOS `connect`).
13. **Step 5, "Completar o teu perfil".**
    - **Rows:** one per linked coach from `me.coaches`. Each shows Nível and Lado, reading the
      coach's `level` (its label) and `side` ("Esquerda", "Direita" or "Ambos") from `/auth/me`
      (rule 14), or "Por definir" when null.
    - **Done** still reads from the dashboard: the step is done when no coach is listed in
      `profile_incomplete` (rule 3.5). The `/auth/me` values are only shown.
    - **Reminder:** "Lembrar treinador" (`setup-remind-<coachId>`) uses
      `POST /api/app/profile-reminder` (`dashboard.profile-completeness` rules 6–7). There is one
      button per coach that `profile_incomplete` lists with `canRemind`, and none for a complete
      coach. Once `remindedToday`, it turns into "Lembrete enviado ao {coach}. O passo fica feito
      quando ele completar o teu perfil." *(OQ-D assumption: change the copy from the design's
      "Avisamos-te quando ele completar o teu perfil".)*
    - **Line under the button:** "O {coach} recebe-o na LevApp." *(OQ-E assumption, in place of "…
      na LevApp e por email".)* No notice and no email are added.
    - The student can never mark this step done. Step 5 has no "Saltar".
14. **The `/auth/me` contract** (additive keys only; `settings.profile` rule 12).
    - **`GET` returns** `setupGuide: {snoozedAt: ISO-8601 UTC|null, hidden: bool, readyClosed:
      bool, alwaysAvailable: bool, alertsConfirmed: bool}` for every account
      (`settings.role-scope` rule 8 keeps the route open to both roles), with all five false or
      null for a coach. `snoozedAt` is serialized with `to_utc_iso`.
    - **`coaches[]`** gains `level` (the coach's level label, or null) and `side` (`"left"`,
      `"right"`, `"both"` or null) per coach, read from that coach's `coach_in_player` row
      (`api_auth._student_coaches`). Old builds ignore unknown keys.
    - **`PATCH` accepts** `setupGuideSnooze: true`, `setupGuideHidden: bool`,
      `setupGuideReadyClosed: true`, `setupGuideAlertsConfirmed: true` and `alwaysAvailable: bool`.
      - The keys are added to `OWN_PROFILE_FIELDS` (`user_service.py:196`); otherwise they are
        dropped silently.
      - They are coerced by the same membership-checked `_coerce_bool` as the notification flags.
      - `false` for `setupGuideSnooze`, `setupGuideReadyClosed` or `setupGuideAlertsConfirmed` is
        400, like a non-boolean.
    - **Only a student writes these keys.** The role check runs before any field is written. A
      request from a coach that holds any of them is 403 as a whole, and nothing in it is stored,
      not even its other keys. *(Decision:* a partial write would be silent.)
    - **The server takes `now` for the snooze.** The route takes one `now` and passes it into
      `update_own_profile_service(…, now=)` (backend/CLAUDE.md), which stores it. A client never
      sends a time.
    - **Clients:** the keys are added to `packages/api` `auth.ts`, `packages/types` `domain.ts`
      and the iOS `write-auth-me` callers.
15. **Old builds.** App Store builds before this ticket ignore the new `/auth/me` and blocker keys,
    and never call the schedule endpoints. Rows a schedule wrote are ordinary blockers to them,
    editable in their sheet. Nothing breaks for them.
16. **Web and iOS ship together.** Every surface above exists on both shells, and each criterion
    names a test on each shell it covers. Android is the same Expo app, with its own Settings path
    in rule 7. *Decision:* no Android test lane is added (as for PAD-834). Android's step-2 path is
    covered by `deviceStepState`'s unit test.
17. **A guide-made schedule is an ordinary blocker.** Its rows are `type="unavailable"`,
    `blocks_auto_invitations=true` rows of the student, so `calendar.student-blockers` rules 4, 5
    and 11 apply to them unchanged. In those hours, no automatic invitation, manual invitation,
    reminder or waiting-list offer reaches the student. `classes.availability` takes those hours
    out of the student's booking options. No suppression code changes.

### Not this spec
- A server-side "push enabled" flag. Step 2 is per device (OQ-9).
- Grouped schedules on the Disponibilidade tab (OQ-G), and the editor reached from there.
- Open-ended recurring blocks (Q7, `calendar.student-blockers`).
- Telling the student when the coach completes their profile (OQ-D).
- Any change to what a blocker suppresses. Guide-made rows are ordinary blockers (rule 17).

### Today
- **Request alerts:** `users.notif_request_alerts` (`backend/padel_app/models/users.py:134`,
  default ON), on `/auth/me` as `requestAlerts` (`backend/padel_app/modules/api_auth.py`
  `_serialize_me`). It is written by `user_service.update_own_profile_service` (keys filtered by
  `OWN_PROFILE_FIELDS`, line 196; `_coerce_bool`, ~343; no `now` parameter today). The web Settings
  switch is in `SettingsPage.tsx:896-912` and the iOS one in
  `features/settings/preferences-section.tsx:70-100`, both behind explicit-save. Pinned by
  `test_pad232_request_alerts.py`.
- **Push:**
  - iOS/Android: `lib/push/expoPushRegistrar.ts` (`register()` prompts, `registerIfPermitted()`
    never does). Mobile `src/auth/AuthContext.tsx:115,170,185` calls `register()` at login and on
    every restore (`messaging.push-notifications` rules 9 and 15).
  - Web: `src/auth/AuthContext.tsx:74,102` calls `requestAndSubscribe` at login and restore
    (`auth.push-subscription` rule 4). The hook is `hooks/usePushNotifications.ts` (`isSupported`
    at line 26).
  - The denied path is `features/notifications/notifications-blocked-banner.tsx`
    (`Linking.openSettings()`).
  - There is no server flag, and no iPhone-browser detection anywhere in the web app.
- **Blockers:**
  - Model and CRUD: `CalendarBlock` (`models/calendar_blocks.py`) holds one interval per row, with
    a weekly `recurrence_rule` `{"frequency":"weekly","daysOfWeek":[…]}` and no group column. CRUD
    goes through `student_availability_service.py`. Create is `create_student_blocker` →
    `calendar_service.add_event_service`, which commits per row and then sets
    `blocks_auto_invitations` in a second `save()`. Edit is `_edit_block_payload`, where a blank
    `endDate` while recurring is refused (line ~204).
  - Serializer: `serialize_calendar_block` (`serializers/calendar.py:13-45`) has no group key.
  - Splits: `_clone_block` (`calendar_service.py:16-29`, used by `_split_block` when a single
    occurrence is deleted) copies no group key. Its dropped `blocks_auto_invitations` is fixed
    separately, on `fix/clone-block-keeps-auto-invite-suppression`.
  - End date: on create, a missing `endDate` reaches the legacy form as `""`. Whether that stores
    NULL is not read in the code to the end. The occurrence search is capped at +400 days
    (`calendar_service.py:41`). The shared builder `packages/config/src/blocker-draft.ts` always
    sends an end of start + 3 months.
  - Suppression: `notification_service` eligibility (~1748), manual (~6844), reminders (~3778),
    the `_send_system_message` backstop, and booking availability (`classes.availability`, which
    takes off each person's `unavailable` blocks).
  - Pinned by `test_student_availability_blockers.py`, `test_pad367_falsy_values_at_the_route.py`,
    `test_pad357_availability_and_requests.py`, `blocker-draft.test.ts` and
    `e2e/availability/*.spec.ts`.
- **Coach link:** `/auth/me` `coaches` is `[{id, name}]` (`api_auth._student_coaches`, which does not
  filter disabled coaches). The dashboard connect prompt is in `StudentDashboard.tsx` on both
  shells. Pinned by `players/join-token` tests. Levels: `coach_in_player.level_id` →
  `CoachLevel.label`; `side` ∈ `left|right|both` (`models/Association_CoachPlayer.py:23,29`).
- **Profile step:**
  - `profile_completeness_service.build_profile_incomplete_block` (`{coachId, coachName, missing,
    remindedToday, canRemind}`) lists incomplete coaches only.
  - `send_profile_reminder` sends a chat message, an SSE event and a push to the coach. It sends
    **no email**, and nothing tells the student when the coach completes it.
  - Web `ProfileIncompleteBlock.tsx`, iOS `features/dashboard/profile-completeness.tsx`. Pinned by
    `e2e/dashboard/profile-completeness.spec.ts` and `profile-completeness.test.tsx`.
- **Dismissals:** none on the server. Everything is device-local (`CountryPrompt.tsx`,
  `country-prompt-storage.ts`, `email-prompt-banner.tsx`).
- **Surfaces:**
  - The student dashboard is composed in `StudentDashboard.tsx` (web `components/dashboard/`, iOS
    `features/dashboard/`).
  - The account avatar is in the layouts: web `components/layout/AppLayout.tsx` (the header avatar
    menu), and iOS `app/(tabs)/_layout.tsx` (around line 37, the only way into Settings).
  - Settings sections are `SETTINGS_TABS` (web `SettingsPage.tsx:129`) and
    `features/settings/settings-sections.test.ts` (iOS), with student sections listed exactly by
    `settings.role-scope` rule 2.
  - Club-local dates on the client: `lisbonNow` (`packages/config/src/club-date.ts:95`).
    Server-side: `utc_to_wall_naive` (`utils/dates.py:48`).

### Acceptance Criteria

#### DASHBOARD-STUDENT-SETUP-GUIDE-1: The percent is always the done steps × the step weight (rules 1–3)
- **Given** every combination of the five done signals (requestAlerts with alertsConfirmed, device permission, a current blocker or alwaysAvailable, coaches, profile_incomplete), all loaded
- **When** `setupGuideState` runs
- **Then** `percent === doneCount × const:SETUP_GUIDE_STEP_WEIGHT`, the steps follow `const:SETUP_GUIDE_STEPS`, and `next` is the first pending step in that order
- **And** `profile` is pending with no coach, and pending while a `profile_incomplete` block names any coach *(OQ-10)*
test: `frontend/packages/config/src/student-setup-guide.test.ts` › `percent is done steps times the weight, for every combination`

#### DASHBOARD-STUDENT-SETUP-GUIDE-2: A student who joined by a coach's link opens the guide at 20% with step 4 done (rules 3.4, 4) *(OQ-8)*
- **Given** a new student who signed up through a coach's join link, request alerts at their default (ON, not confirmed), with no blockers, on a web browser with no push permission
- **When** they land on the dashboard for the first time
- **Then** the sheet is open and reads "1 de 5 passos · 20%", step 4 reads "Feito", and step 1 is the current step
test: `frontend/apps/web/e2e/dashboard/student-setup-guide.spec.ts` › `[DASHBOARD-STUDENT-SETUP-GUIDE-2] a student who joined by link opens the guide at 20%`
test: `frontend/apps/mobile/.maestro/flows/<next>-setup-guide-first-login.yaml` (tag `DASHBOARD-STUDENT-SETUP-GUIDE-2`)

#### DASHBOARD-STUDENT-SETUP-GUIDE-3: Step 1 is done only once confirmed, and Settings agrees (rules 3.1, 6) *(OQ-8)*
- **Given** a new student at 20% (coach step done), whose `requestAlerts` is ON by default and not confirmed; and a second student at 20% who switched `requestAlerts` off in Settings
- **When** each presses "Ativar notificações" in step 1, and the first later switches the alerts off in Settings and saves
- **Then** each sends `PATCH /api/auth/me {requestAlerts: true, setupGuideAlertsConfirmed: true}` with no Settings save, the guide reads 40% and opens step 2, and Settings › Preferences shows the switch on without a reload
- **And** after the first student switches the alerts off, step 1 is pending again (20%)
test: `frontend/apps/web/src/components/setup-guide/StepRequestAlerts.test.tsx` › `turns request alerts on and refreshes the auth user`
test: `frontend/apps/mobile/src/features/setup-guide/step-request-alerts.test.tsx` › `turns request alerts on, writes the auth-me cache and refreshes the user`

#### DASHBOARD-STUDENT-SETUP-GUIDE-4: "Agora não" snoozes the sheet until the next Lisbon day, on every device (rules 4, 14)
- **Given** a student at 40% whose sheet is open, on a summer day, with the clock pinned
- **When** they press "Agora não" at 23:30 Lisbon time (`2026-07-14T22:30Z`), then open the dashboard at 23:50 Lisbon (`22:50Z`), and again at 00:10 Lisbon the next day (`2026-07-14T23:10Z`, still the same UTC day)
- **Then** the server stores `setup_guide_snoozed_at = 2026-07-14 22:30` (its own `now`, UTC), the 23:50 dashboard shows the compact card but no sheet, and the 00:10 dashboard shows the sheet again
- **And** a second device signed in to the same account sees the same at the same moments
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_snooze_stores_the_servers_now`
test: `frontend/packages/config/src/student-setup-guide.test.ts` › `the sheet returns after the next Lisbon midnight, not the UTC one`

#### DASHBOARD-STUDENT-SETUP-GUIDE-5: "Não mostrar mais" removes the guide on every device, and Perfil › Configurar conta still opens it (rules 4, 14)
- **Given** a student at 40%
- **When** they press "Não mostrar mais" on one device, then sign in on a second device
- **Then** neither device shows the sheet, the card, the avatar ring or "Conta pronta", `GET /api/auth/me` returns `setupGuide.hidden: true`, and Perfil › Configurar conta (`settings-setup-guide`) opens the guide at 40%
test: `frontend/apps/web/e2e/dashboard/student-setup-guide.spec.ts` › `[DASHBOARD-STUDENT-SETUP-GUIDE-5] hide holds on a second session and Configurar conta still opens it`
test: `frontend/apps/mobile/.maestro/flows/<next>-setup-guide-hide.yaml` (tag `DASHBOARD-STUDENT-SETUP-GUIDE-5`)

#### DASHBOARD-STUDENT-SETUP-GUIDE-6: The compact card opens the next pending step, and steps skip what is done (rules 4, 5)
- **Given** a student with steps 1 and 4 done who snoozed the sheet
- **When** they tap the card, press "Saltar" on step 2, and then press "Agora não" on step 3
- **Then** the card reads "CONFIGURAR CONTA · 2 DE 5 · 40%" with "A seguir: {step 2}", the tap opens step 2, "Saltar" opens step 3 and writes nothing, "Agora não" returns to the dashboard and writes nothing, and the card still reads 2 de 5
test: `frontend/apps/web/src/components/setup-guide/SetupGuideCard.test.tsx` › `opens the next pending step and skip and leave write nothing`
test: `frontend/apps/mobile/src/features/setup-guide/setup-guide-card.test.tsx` › `opens the next pending step and skip and leave write nothing`

#### DASHBOARD-STUDENT-SETUP-GUIDE-7: The avatar ring in the layout follows the percent, for a student only (rule 4)
- **Given** a student at 60%, not hidden, on the dashboard and then on another screen; the same student at 100%; and a coach
- **When** the layout renders
- **Then** the student's avatar carries a ring at 60% on both screens, and no ring at 100%; the coach's avatar never carries one
test: `frontend/apps/web/src/components/layout/AppLayout.setup-ring.test.tsx` › `the avatar ring shows the percent for a student until 100`
test: `frontend/apps/mobile/src/features/setup-guide/avatar-ring.test.tsx` › `the avatar ring shows the percent for a student until 100`

#### DASHBOARD-STUDENT-SETUP-GUIDE-8: Step 2 prompts only after the explanation (rule 7) — BLOCKED by OQ-C
- **Given** an iPhone whose permission is undetermined
- **When** the student opens step 2
- **Then** no system prompt has been shown yet, and pressing "Permitir notificações" shows it once
test: `frontend/apps/mobile/.maestro/flows/<next>-setup-guide-device-push.yaml` (tag `DASHBOARD-STUDENT-SETUP-GUIDE-8`), to be written after OQ-C

#### DASHBOARD-STUDENT-SETUP-GUIDE-9: `deviceStepState` gives one state per platform and permission (rule 7)
- **Given** (ios, undetermined), (ios, denied), (ios, granted), (android, denied), (web, default), (web, denied), (web, granted, subscribed), (web, granted, not subscribed), (web, unsupported) and (web on iPhone Safari, any)
- **When** `deviceStepState` runs
- **Then** they give `ask` *(OQ-C)*, `open_settings` (iOS path), `done`, `open_settings` (Android path), `ask` *(OQ-C)*, `padlock`, `done`, `ask` (subscribe, no prompt), `unsupported` and `ios_browser`; only the two `done` cases count as done
- **And** `isIosBrowserWithoutApp()` is true for an iPhone and an iPadOS-as-Mac user agent outside standalone, and false inside an installed web app and on a desktop browser
test: `frontend/packages/config/src/student-setup-guide.test.ts` › `device step state for each platform and permission`
test: `frontend/apps/web/src/utils/pushNotifications.test.ts` › `isIosBrowserWithoutApp detects Safari on an iPhone outside an installed app`

#### DASHBOARD-STUDENT-SETUP-GUIDE-10: Same hours every day, two periods, are saved as two rows on all seven days (rules 9, 10)
- **Given** the editor in "Igual todos os dias"
- **When** the student taps "Todos", 09 › 11, 15 › 20 and Guardar (4 taps on the grid)
- **Then** one `PUT /api/app/availability_schedules/<id>` writes exactly two rows with the same `schedule_id`: 09:00–11:00 and 15:00–20:00, both weekly on days 0–6, type `unavailable`, `blocks_auto_invitations` true
- **And** the summary reads "Não recebes convites nem lembretes todos os dias, das 09:00 às 11:00 e das 15:00 às 20:00."
test: `frontend/packages/config/src/availability-schedule.test.ts` › `same every day with two periods makes two rows on the chosen days`
test: `frontend/apps/web/e2e/availability/schedule-editor.spec.ts` › `[DASHBOARD-STUDENT-SETUP-GUIDE-10] two periods every day`
test: `frontend/apps/mobile/.maestro/flows/<next>-schedule-editor-same.yaml` (tag `DASHBOARD-STUDENT-SETUP-GUIDE-10`)

#### DASHBOARD-STUDENT-SETUP-GUIDE-11: Hours that vary per day are saved as one row per distinct interval (rules 9, 10)
- **Given** the editor in "Igual" with Seg–Sex chosen ("Dias úteis") and 09 › 11 and 15 › 20, switched to "Varia por dia" (each weekday now holds both periods, Seg open)
- **When** on Ter the student presses "Limpar" and taps 09 › 20; on Qua presses × on 15:00–20:00; and on Seg uses "Copiar segunda para…" on Qui and Sex
- **Then** the rows saved are 09:00–11:00 on {Mon, Wed, Thu, Fri}, 15:00–20:00 on {Mon, Thu, Fri} and 09:00–20:00 on {Tue}, sharing one `schedule_id`
- **And** "A tua semana" reads "09–11 · 15–20" for Mon, Thu and Fri, "09–20" for Tue, "09–11" for Wed and "Livre" for Sat and Sun
- **And** `blockersToSchedule` of those rows reopens the same week, in "Varia"
test: `frontend/packages/config/src/availability-schedule.test.ts` › `varies per day coalesces equal intervals and round-trips`
test: `frontend/apps/mobile/.maestro/flows/<next>-schedule-editor-varies.yaml` (tag `DASHBOARD-STUDENT-SETUP-GUIDE-11`)

#### DASHBOARD-STUDENT-SETUP-GUIDE-12: The grid's taps make, merge, free and fill one hour, exactly as rule 9 says (rule 9)
- **Given** an empty day
- **When** the student taps 13 then 09; then 13 then 15; then (nothing pending) 10; then 18 and 18 again; then "Limpar"
- **Then** the periods are 09:00–13:00 (the taps swapped, `[09, 13)`), then 09:00–15:00 (13 was the free "LIVRE" hour, so it started a period that merged on the touching edge), then 09:00–10:00 and 11:00–15:00 (the busy 10 freed), then those plus 18:00–19:00 (the same hour twice fills `[18, 19)`), then none
- **And** after 09:00–13:00 the 13 cell is marked "LIVRE" and is not filled, and the hint reads step 1, then 2 while a start is pending, then 3
- **And** with 09:00–13:30, a tap on the half-busy 13 (nothing pending) marks a start and frees nothing
test: `frontend/packages/config/src/availability-schedule.test.ts` › `grid taps make, merge, free and fill one hour`

#### DASHBOARD-STUDENT-SETUP-GUIDE-13: + / − move a period by the step, the day's end maps to 23:59, and odd minutes widen (rule 9)
- **Given** the period 09:00–13:00
- **When** the student taps "+" on its end
- **Then** the period is 09:00–13:30, the 13 cell is half filled with a dashed outline, and the row saved ends at 13:30
- **And** "−" on a start of 00:00 and "+" on an end of 24:00 change nothing, a period one step long cannot shrink, and an end grown into the next period merges the two
- **And** a period ending at 24:00 is saved with the end `const:SCHEDULE_DAY_END`, reopens as 24:00, and "−" on that end gives 23:30
- **And** a row stored as 05:15–06:40 opens as 05:00–07:00, listed in the periods though not on the grid
test: `frontend/packages/config/src/availability-schedule.test.ts` › `the step moves edges by 30 minutes within the day`
test: `frontend/apps/web/src/components/availability/ScheduleEditor.test.tsx` › `a :30 end renders the hour half filled`
test: `frontend/apps/mobile/src/features/availability/schedule-editor.test.tsx` › `a :30 end renders the hour half filled`

#### DASHBOARD-STUDENT-SETUP-GUIDE-14: Save waits for a day and a period; Editar reopens by `scheduleId`; editing replaces and deleting removes every row (rules 9, 10)
- **Given** a saved schedule of three rows, listed by `GET /availability_blockers` with the same `scheduleId`, and one hand-made block with `scheduleId: null`
- **When** the student opens the schedule with "Editar", removes one period and saves; then opens it again and presses "Apagar bloqueio"
- **Then** Guardar was disabled while no day or no period was chosen; "Editar" opened the three rows and not the hand-made block; the edit leaves exactly the remaining rows under the same `scheduleId`; the delete leaves none; the hand-made block is untouched throughout
test: `frontend/apps/web/src/components/availability/ScheduleEditor.test.tsx` › `save is disabled until a day has a period, and Editar opens the schedule's rows only`
test: `frontend/apps/mobile/src/features/availability/schedule-editor.test.tsx` › `save is disabled until a day has a period, and Editar opens the schedule's rows only`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_put_replaces_a_schedules_rows`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_delete_removes_every_row_of_a_schedule`

#### DASHBOARD-STUDENT-SETUP-GUIDE-15: Step 3 is done by a current block or by "Estou sempre disponível" (rules 3.3, 8)
- **Given** a student with no blocker; a student whose only blocker is deleted on the Disponibilidade tab; and a student whose only blocker is a one-off dated yesterday
- **When** the first presses "Estou sempre disponível" in step 3, and each opens the guide
- **Then** the first sends `PATCH /api/auth/me {alwaysAvailable: true}`, step 4 opens, and step 3 is done on every device; the second's and the third's step 3 are pending
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_always_available_is_stored`
test: `frontend/packages/config/src/student-setup-guide.test.ts` › `step 3 needs a block with an occurrence today or later, or always-available`
test: `frontend/apps/web/src/components/setup-guide/StepUnavailability.test.tsx` › `always available saves and moves on`
test: `frontend/apps/mobile/src/features/setup-guide/step-unavailability.test.tsx` › `always available saves and moves on`

#### DASHBOARD-STUDENT-SETUP-GUIDE-16: A preset saves its rows in one tap (rule 8)
- **Given** step 3 with "Trabalho em dias úteis" selected
- **When** the student presses "Guardar e continuar"
- **Then** one row, weekly Mon–Fri 09:00–18:00 and titled "Trabalho" (`const:SCHEDULE_PRESETS`), is saved under a new `scheduleId`, step 3 is done and step 4 opens
test: `frontend/apps/web/e2e/dashboard/student-setup-guide.spec.ts` › `[DASHBOARD-STUDENT-SETUP-GUIDE-16] a preset saves and moves on`
test: `frontend/apps/mobile/src/features/setup-guide/step-unavailability.test.tsx` › `a preset saves one schedule and moves on`

#### DASHBOARD-STUDENT-SETUP-GUIDE-17: Step 5 shows each coach's level and side, can only remind, and is done only when every coach set both (rules 3.5, 13, 14) *(OQ-10)*
- **Given** a student linked to coaches A (level "B2", side left) and B (level "C1", no side); `/auth/me` lists both with their `level` and `side`; `profile_incomplete` lists B with `missing: ["side"]`
- **When** they open step 5 and press "Lembrar treinador" for B
- **Then** A's row reads Nível "B2", Lado "Esquerda" with no button; B's reads Nível "C1", Lado "Por definir" with the button; the reminder goes through `POST /api/app/profile-reminder {coachId: B}`; B's button turns into "Lembrete enviado ao B. O passo fica feito quando ele completar o teu perfil."; and step 5 stays pending until B sets the side
test: `frontend/apps/web/src/components/setup-guide/StepProfile.test.tsx` › `shows each coach's level and side, reminds, and stays pending until every coach completes`
test: `frontend/apps/mobile/src/features/setup-guide/step-profile.test.tsx` › `shows each coach's level and side, reminds, and stays pending until every coach completes`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_auth_me_coaches_carry_level_and_side`

#### DASHBOARD-STUDENT-SETUP-GUIDE-18: "Conta pronta" shows until closed, once per account (rule 4)
- **Given** a student with all five steps done and `readyClosed: false`
- **When** they open the dashboard, reload, press "Fechar", and open the dashboard on a second device
- **Then** "Conta pronta · 5 de 5" shows on the first open and after the reload, "Fechar" sends `setupGuideReadyClosed: true`, and after that neither device shows any guide surface
test: `frontend/apps/web/e2e/dashboard/student-setup-guide.spec.ts` › `[DASHBOARD-STUDENT-SETUP-GUIDE-18] the ready card shows until closed`
test: `frontend/apps/mobile/src/features/setup-guide/setup-guide-card.test.tsx` › `the ready card shows until closed`

#### DASHBOARD-STUDENT-SETUP-GUIDE-19: `/auth/me` carries the guide's state, and only a student writes it, before anything is written (rule 14)
- **Given** a student and a coach
- **When** each GETs `/api/auth/me`; the student PATCHes each of the five keys; the coach PATCHes `{name: "X", setupGuideHidden: true}`; and the student PATCHes `setupGuideHidden: "yes"`, `setupGuideSnooze: false` and `setupGuideReadyClosed: false`
- **Then** both GETs carry `setupGuide` with its five fields (`snoozedAt` as UTC ISO); the student's writes are stored, the snooze with the route's `now`; the coach gets 403 and the coach's name is unchanged; the last three are 400 and store nothing
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_auth_me_carries_the_setup_guide_state`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_a_coach_write_of_a_guide_key_is_refused_before_anything_is_stored`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_guide_keys_take_only_their_allowed_values`

#### DASHBOARD-STUDENT-SETUP-GUIDE-20: The dashboard payloads hold no new block type, and a coach never sees the guide (rules 1, 15)
- **Given** a student (with an incomplete profile and a class) and a coach
- **When** each GETs `/api/app/dashboard`, and each dashboard renders
- **Then** the student's block types are a subset of DASHBOARD-BLOCKS-8's list (`messages_overview`, `profile_incomplete`, `next_class`, `needs_you`, `schedule_7d`, `kpi_grid`, `evaluations`), the coach's are those its current payload test pins, neither holds a type containing `setup`, and the coach sees no guide surface
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_the_dashboard_payloads_hold_no_setup_guide_block`
test: `frontend/apps/web/src/components/setup-guide/SetupGuideCard.test.tsx` › `a coach never sees the guide`
test: `frontend/apps/mobile/src/features/setup-guide/setup-guide-card.test.tsx` › `a coach never sees the guide`

#### DASHBOARD-STUDENT-SETUP-GUIDE-21: The summary and the switch between modes say and keep what was marked (rule 9)
- **Given** the editor in "Igual"
- **When** the days are all seven, then Mon–Fri, then Sat and Sun, then Tue alone, then Sat alone, then Mon, Tue and Wed, each with 09–11 and 15–20; and then nothing chosen, days with no hours, and hours with no days
- **Then** the summary reads "… todos os dias, das 09:00 às 11:00 e das 15:00 às 20:00.", "… de segunda a sexta, …", "… ao fim de semana, …", "… à terça, …", "… ao sábado, …", "… à seg, ter e qua, …", then "Escolhe os dias e toca nas horas em que estás ocupado.", "Falta marcar as horas ocupadas." and "Falta escolher os dias."
- **And** switching to "Varia" puts those periods on each chosen day and opens the first; switching back with Tue open takes Tue's periods and chooses every day that has periods
- **And** the name chips are `const:SCHEDULE_NAME_SUGGESTIONS`; tapping one chooses it, and tapping it again clears it
test: `frontend/packages/config/src/availability-schedule.test.ts` › `summary wording, mode switches and name chips`

#### DASHBOARD-STUDENT-SETUP-GUIDE-22: Nothing reads as done while a source is loading or failed (rule 3a)
- **Given** a student with steps 1–4 done whose dashboard payload is still loading; the same with the dashboard request failed; and a student whose blockers list is still loading
- **When** `setupGuideState` runs and the dashboard renders
- **Then** step 5 (first two) and step 3 (third) are `unknown`, the percent is not shown, the bar is a skeleton, the sheet does not open, and "Conta pronta" does not show; once every source answers, the real state shows
test: `frontend/packages/config/src/student-setup-guide.test.ts` › `a step is unknown until its sources answer, and unknown never reads as done`
test: `frontend/apps/web/src/components/setup-guide/SetupGuideCard.test.tsx` › `no ready card while the dashboard is loading`
test: `frontend/apps/mobile/src/features/setup-guide/setup-guide-card.test.tsx` › `no ready card while the dashboard is loading`

#### DASHBOARD-STUDENT-SETUP-GUIDE-23: Step 2 renders each state on its shell (rule 7)
- **Given** step 2 with the states `open_settings` on iOS and on Android, `padlock` and `ios_browser` on web
- **When** it renders, and the student presses the button
- **Then** iOS shows the iPhone Settings path and "Abrir Definições", which calls `Linking.openSettings()`; Android shows the Android path; web `padlock` shows the padlock help and "Já mudei, verificar", which reads the permission again; `ios_browser` shows "Obter na App Store" and never marks the step done
test: `frontend/apps/mobile/src/features/setup-guide/step-device-push.test.tsx` › `denied shows the platform's path and opens the system settings`
test: `frontend/apps/web/src/components/setup-guide/StepDevicePush.test.tsx` › `padlock help re-checks, and iPhone Safari shows the App Store link`

#### DASHBOARD-STUDENT-SETUP-GUIDE-24: Every way of closing the sheet except "Não mostrar mais" snoozes it (rule 4)
- **Given** the open sheet, four times
- **When** the student closes it with "Agora não", with "Começar", with a swipe down, and with a tap on the backdrop
- **Then** each sends `PATCH /api/auth/me {setupGuideSnooze: true}` once, and "Começar" also opens the next pending step; "Ver os 5 passos" on the card opens the list without sending anything until it is closed
test: `frontend/apps/web/src/components/setup-guide/SetupGuideSheet.test.tsx` › `every close but hide snoozes`
test: `frontend/apps/mobile/src/features/setup-guide/setup-guide-sheet.test.tsx` › `every close but hide snoozes`

#### DASHBOARD-STUDENT-SETUP-GUIDE-25: Step 4 opens the coach-link flow (rule 12)
- **Given** a student with no coach on step 4
- **When** they press "Ligar-me a um treinador"
- **Then** web opens `/connect` and iOS opens the `connect` screen, and the step writes nothing
test: `frontend/apps/web/src/components/setup-guide/StepCoachLink.test.tsx` › `opens the connect flow`
test: `frontend/apps/mobile/src/features/setup-guide/step-coach-link.test.tsx` › `opens the connect flow`

#### DASHBOARD-STUDENT-SETUP-GUIDE-26: A guide-made schedule really keeps invitations, reminders and booking out of its hours (rule 17)
- **Given** the clock pinned to Monday 2026-11-16 09:00 Lisbon, and a student who saved through `PUT /availability_schedules` the schedule "Todos, 09:00–11:00 and 15:00–20:00" (CALENDAR-STUDENT-BLOCKERS rules 4, 5, 11 unchanged)
- **When** the engine computes automatic-invitation eligibility for a class on Tuesday 2026-11-17 at 10:00–11:00 and one at 12:00–13:00; the reminder job runs for the 10:00 class with the student enrolled; and the student's booking options for Tuesday are computed (`classes.availability`)
- **Then** the student is not eligible for the 10:00 class and is eligible for the 12:00 one; no reminder `Message` is created for the student for the 10:00 class; and the booking options for Tuesday hold no slot overlapping 09:00–11:00 or 15:00–20:00
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_a_schedule_keeps_auto_invitations_away_in_its_hours`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_a_schedule_holds_back_the_reminder`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_a_schedule_takes_its_hours_out_of_booking`

#### DASHBOARD-STUDENT-SETUP-GUIDE-27: A schedule's PUT is all or nothing (rules 10, `calendar.student-blockers` 18)
- **Given** a saved schedule of two rows
- **When** the student PUTs a replacement of three rows whose third has its end before its start; then PUTs a new id; then another student PUTs and DELETEs the first student's id; then a coach PUTs any id
- **Then** the first answers 400, and the two original rows are still there unchanged, with `blocks_auto_invitations` true; the new id creates its rows; the other student gets 404 and nothing changes; the coach gets 403
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_one_invalid_row_writes_nothing_and_keeps_the_old_rows`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_put_with_an_unknown_id_creates_the_schedule`
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_another_students_schedule_is_404_and_a_coach_is_403`

### Waves
1. **Migration and server** (4, 14 backend, 15 backend, 17 backend, 19, 20 backend, 26, 27, and
   CALENDAR-STUDENT-BLOCKERS-15):
   - The work: the users columns, `calendar_blocks.schedule_id` (model index included),
     `/auth/me` GET/PATCH (`OWN_PROFILE_FIELDS`, the role check before writes, `now=`), the
     `coaches[]` `level`/`side`, `scheduleId` in `serialize_calendar_block`,
     `availability_schedules` PUT/DELETE as one unit of work, and `_clone_block` copying
     `schedule_id`.
   - Surfaces: `users.py`, `calendar_blocks.py`, `api_auth.py`, `user_service.py`,
     `frontend_api.py`, `student_availability_service.py`, `calendar_service.py`,
     `serializers/calendar.py`, and one Alembic revision.
   - **The same wave hides the guide in every test seed.** The first-login sheet opens over the
     student dashboard. So the E2E seed (`npm run test:e2e:reset`), the Maestro seed and the
     backend fixtures that build students set `setup_guide_hidden_at` on every seeded student,
     except this spec's own fixtures, which create their students fresh.
   - Students created during a test land fresh too: the E2E register and join-token specs, and
     any `flask onboarding` fixture students. They must close the sheet with "Não mostrar mais"
     in a shared helper, or be created hidden. Otherwise every existing student E2E spec and
     Maestro flow meets the sheet: `e2e/dashboard/student-dashboard-home.spec.ts`,
     `student-dashboard-kpi.spec.ts`, `profile-completeness.spec.ts`, `e2e/availability/*`,
     `e2e/class-requests/*`, `e2e/auth*/` register and join specs, and the student Maestro flows
     (list in `CHANGES.md`).
   - Done when those suites pass unchanged on the branch with the guide built (wave 3).
2. **Shared logic.** `@levelup/config` `student-setup-guide.ts` and `availability-schedule.ts`,
   `packages/api` and `packages/types` keys: 1, 4 (client), 9, 11, 12, 13 (logic), 15 (state), 21,
   22 (state).
3. **Guide on web and iOS.** Sheet, card, ring, ready card, steps 1, 2 (non-prompt), 4, 5, and
   Perfil › Configurar conta: 2, 3, 5, 7, 17, 18, 20 (UI), 22 (UI), 23, 24, 25.
4. **Editor and step 3 on web and iOS.** Presets, the schedule editor and always-available: 6
   (needs step 3), 10, 11, 13 (render), 14, 15 (UI), 16.
5. **After OQ-C:** 8.

### Open questions
- **Q7 (STOP, owner): do guide-made recurring blocks end?** Today every recurring blocker the
  clients make ends 3 months after its start (`calendar.student-blockers` rule 16; the edit path
  refuses a null end, rule 17). The promise P-CALENDAR-4 says "recurring on chosen weekdays
  **between two dates**". That is a recorded owner decision, so neither is amended here.
  - (a) **Keep the 3-month end.** The editor sends start = today and end = today + 3 months. A
    schedule silently stops holding back invitations after 3 months, and step 3 then turns pending
    again (rule 3.3 needs an occurrence today or later). It would need a follow-up: the guide or
    the tab says when a schedule ends, and offers "Prolongar".
  - (b) **Open-ended for recurring.** This amends `calendar.student-blockers` rules 16 and 17 and
    P-CALENDAR-4's bullet. The editor (and maybe the Criar bloqueio sheet) sends `endDate: null`.
    The server's create path may already store NULL (not read to the end). The occurrence search
    is capped at +400 days (`calendar_service.py:41`), which would need lifting or rolling. The
    edit path's null-end 400 (rule 17, PAD-386) must change.
  - Recommendation: (b), because "Trabalho em dias úteis" is not a 3-month fact. Rule 10's
    criteria do not depend on it. Only the end date sent changes.
- **OQ-C (STOP, conflict): when step 2 may prompt.** The ticket says "first our explanation, then
  the system prompt, which can only be asked once", with a button that prompts.
  `messaging.push-notifications` rule 15 says "Only login, sign-up, a restored session and the
  banner's tap ever prompt". `auth.push-subscription` rule 4 prompts on web at login
  (`auth/AuthContext.tsx:74,102`). So on iOS the dialog has nearly always been answered before the
  guide opens.
  - (a) Add the guide's button to rule 15's list (and web rule 4), and keep the prompts at login
    and restore. The button then works only on the rare undetermined device, and the
    explanation-first order the ticket asks for does not hold.
  - (b) For a student, stop prompting at login, sign-up and restore (mobile
    `AuthContext.tsx:115,170,185`, web `AuthContext.tsx:74,102`). The guide's step 2 and the
    Messages banner become the only prompt sites, as the ticket intends. This amends rule 15 and
    web rule 4 for students. A student who hides the guide, or never opens step 2, is not prompted
    until they open Messages.
  - Recommendation: (b), for students only. Criterion 8 and the `ask` state's prompt wait on this.
- **OQ-8 (assumed (b), owner to confirm): step 1 is ON by default.**
  - (a) ON counts as done, so most students open at 20%, or 40% with a coach link.
  - (b) "Done" also needs the student to have confirmed it in the guide once, via
    `users.setup_alerts_confirmed_at`.
  - Assumed (b) (lead, 2026-11-13), because the ticket's own acceptance criterion and its test 1
    say a coach-link student starts at 20%. The design's first-login sheet also shows 20% with
    the coach step done and step 1 as "A seguir". (a) cannot produce either.
  - Under (a), drop the column and the `setupGuideAlertsConfirmed` key, and criteria 2 and 3 read
    40%.
  - Dependents: criteria 1, 2, 3 and 19, and the migration's `setup_alerts_confirmed_at`.
- **OQ-9 (assumed accepted): step 2 is per device.**
  - The percent and the ring can differ between the student's phone and computer.
  - Safari on an iPhone, or a browser with no Push API, never completes step 2.
  - Because "Conta pronta" is closed per account: once the computer reaches 100% and closes it, a
    phone that never granted push (80% there) loses every guide surface too.
  - Dependents: criteria 1, 9 and 18. A student who only uses iPhone Safari never reaches 100%.
- **OQ-10 (assumed ALL coaches): step 5 with several coaches.** It is done when no linked active
  coach is missing level or side. ANY would be `coaches.length > |profile_incomplete.coaches|`,
  which is equally cheap. Dependents: criteria 1 and 17.
- **OQ-11 (assumed yes): five new user columns and a migration** for "Agora não", "Não mostrar
  mais", "Conta pronta", "Estou sempre disponível" and (OQ-8 b) step 1's confirmation, since the
  ticket requires them to hold across devices. Dependents: criteria 4, 5, 15, 18 and 19.
- **OQ-D (assumed (b), owner to confirm): "Avisamos-te quando ele completar o teu perfil."**
  Nothing tells the student when a coach sets their level and side.
  - (a) Build it: when the last missing field is set on a link that has a `profile_reminder`,
    send the student a push and a chat line. That is new behaviour in
    `dashboard.profile-completeness` (a new rule and criterion, on the coach's level/side write
    paths).
  - (b) Change the copy to "O passo fica feito quando ele completar o teu perfil."
  - Recommendation: (b) in this ticket, and (a) as its own ticket. The guide already updates
    itself on the next dashboard load.
- **OQ-E (assumed copy change, owner to confirm): "O Bernardo recebe-o na LevApp e por email."**
  The reminder is a chat message plus a push, with no email (`send_profile_reminder`). Assumed:
  the copy reads "na LevApp" (rule 13). Adding an email is a change to
  `dashboard.profile-completeness` rule 6d.
- **OQ-F (decided, can revisit): the end of the day.** The design lets a period end at 24:00 (its
  model is 48 half-hour slots). But a row must start and end on one date (`blockerDraftError`),
  and `24:00` is not a time. A 24:00 end is stored as `const:SCHEDULE_DAY_END` and maps back to
  24:00. `const:SCHEDULE_ALL_DAY` is shown as 00–24. A class ending exactly at midnight would
  overlap the last minute, which is harmless.
- **OQ-G (decided for this ticket): schedules on the Disponibilidade tab.** Rows there are listed
  one by one (rule 11). A grouped schedule card with the editor on the tab is a natural follow-up.
  It would amend `calendar.student-blockers` rules 14 and 15.
- **Decided: a client-side guide** (rule 1). A server `student_setup` block was weighed. It needs
  a capability token so older iOS builds skip it, it still cannot know step 2, and every other
  signal is already on the client.
- **Decided:**
  - Começar also snoozes (rule 4).
  - "Conta pronta" stays until Fechar, stored on the account (rule 4).
  - Hidden also hides the ready card and the ring (rule 4).
  - The snooze is an instant compared as Lisbon dates (rule 4, lead 2026-11-13).
  - Step 5's values come from `/auth/me` `coaches[]` (rule 14, lead).
  - The editor widens odd minutes (rule 9).
  - A tab edit to one-off leaves the schedule (rule 11).
  - No Android lane (rule 16).
- Every quoted ask in PAD-839 maps to a criterion above or to one of these questions. The ticket's
  acceptance line "blocks have a real effect: no invitations or reminders, and those hours left
  out of booking" maps to criterion 26. The ticket's seven tests map as follows:
  - 1 → 2
  - 2 → 3, 9 and 23 (the prompt part → 8)
  - 3 → 10 and 26
  - 4 → 11
  - 5 → 13
  - 6 → 4 and 5
  - 7 → 18

  Screenshots for the ticket are a build-phase task, not a criterion.
