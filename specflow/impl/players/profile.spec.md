---
id: players.profile
status: implementing
depends_on: [players.create, evaluations.entries, players.notes, evaluations.history, evaluations.evolution, attendance.history, attendance.absences, calendar.seasons, players.remove]
serves: [P-PLAYERS-1]
governed_by: []
---

# players.profile


### Intent
View a full player profile including evaluations, strengths, weaknesses, and level history.

### Rules
1. `GET /api/app/player_profile/{playerId}` returns full profile
2. Includes: player info, current level, evaluation scores (latest per category), strengths, weaknesses
3. Coach-specific: returns data from the coach's perspective (their notes, their evaluations)
4. **Frontend route `/players/:playerId`, as master–detail (PAD-410; the owner's screenshot
   `docs/reference/2026-09-22-players-page-master-detail.png`).**
   - **Web, ≥ 768px:** `/players` and `/players/:playerId` are ONE two-pane page. The roster
     (`players.list`) is on the left with every control it has on its own. The selected player
     is on the right; with no id, the right pane holds a placeholder ("Escolhe um jogador",
     `player-detail-placeholder`). The id stays in the URL, so a profile is deep-linkable, and
     choosing another row swaps the right pane without reloading the list.
   - **Web, < 768px:** the list and the profile are separate full-width views (the messages
     pattern), and the profile has a back control to `/players`.
   - **Profile content, both shells, in this order (PAD-834; supersedes the PAD-410 order):**
     - header: initials avatar, the name (with the nickname pair of `players.nickname` rule 3),
       beside the name the level and side chips when set (as today) and the state chips of rules
       9 and 11, and the header actions **Adicionar a aulas · Lista de espera · Editar ·
       Desassociar** (destructive, last; "Cancelar convite" for a pending player,
       `players.remove` rules 7 and 9, **[assumption Q5]**). The header's Editar (`player-edit`)
       edits what no block owns: the name and the nickname (`players.nickname` rule 6).
       "Ver presenças", "Ver faltas" and "Avaliações" are not header actions any more: they
       live in the blocks (rules 10, 12);
     - the state alert of rule 9 or rule 11, when one applies, above the blocks;
     - Block 1 **Informação** (rule 8), Block 2 **Avaliações** (rule 10), Block 3
       **Assiduidade** (rule 12);
     - the strengths-and-weaknesses card: **OPEN, owner question Q4** (see Open questions).
       Until Q4 is answered it stays, after Block 3, unchanged (`players.notes` rule 5,
       `evaluations.history` rule 9).
     - Web ≥ 768px lays each block's two columns side by side; iOS and a web view under 768px
       stack them (left column first), and Informação's four fields become a two-column grid.
   - **Platforms (PAD-834, decision D7).** The Expo app is one build for iOS and Android, so the
     mobile tests and Maestro flows named here cover both; the Android CI lane is the Android
     check. No Android-only test is added.
   - Every test id, accessible name and i18n key that still names a control on the page is
     kept; ids of controls that moved or changed behaviour are listed in rule 16.
     `/players/:playerId/attendance` and `/absences` (iOS `/attendance?playerId=`,
     `/absences?playerId=`) stay full pages, reached from the "Ver página completa" link of an
     open list in Block 3 (rule 12), by URL, and from the student's own dashboard.
   - **iOS is phone-only** (`app.json`: `supportsTablet: false`, portrait): the list pushes the
     profile screen, which is master–detail on a narrow screen. Only the content and order above
     apply there.
   - Nothing moves under the finger: a row click never shifts the list, and an action never
     reflows while its own request is pending.
5. The profile offers an "Add to classes" action that opens a week-by-week picker of the coach's
   class instances, backed by `GET /api/app/lesson_instances?from=&to=`. Every non-cancelled
   instance in the selected week is listed; instances already at capacity are shown but not
   selectable. The picker is **not** filtered by the player's level — a coach may add any player
   to any class. **The week runs from Sunday to Saturday (PAD-682, `WEEK_STARTS_ON = 0`; B-192).**
   Every picker — web, iOS and the App Store builds already installed — sends date-only bounds,
   `from=<Sunday>` and `to=<Saturday>`; the route reads a date-only `to` as the end of that day
   (a full timestamp keeps its exact meaning), so a class on the week's last day is listed like
   any other day's
5a. **The picker never offers a class that has started (PAD-439; owner, 2026-09-24).** Classes
   whose start is at or before "now" on the club's clock are left out, today's included (a 12:00
   class at 23:00). Shared by web and iOS: `upcomingPickerClasses` in `@levelup/config`.
5b. **The picker cannot step back before the current week (PAD-439).** "Previous week" is
   disabled on the club's current week (`canStepBackPickerWeek`), on web and iOS.
5c. **The class list scrolls on its own (PAD-439, B-202).** Title and week navigation stay at the
   top and Cancel/Add at the bottom; a long week scrolls in between by wheel or trackpad, on a
   short laptop screen too. Web uses a native `overflow-y: auto` list: Radix ScrollArea inside the
   Dialog did not receive wheel scrolling. iOS already uses a ScrollView.
   **On a phone (PAD-496, B-270).** On every surface (web, a phone's browser, iOS, Android) the
   picker is never taller than the visible window: when the week is long the list gets the
   space that is left and scrolls under a finger; the header and the footer never leave the
   screen. In a phone-width browser the picker takes the screen's height less a small margin
   (`dvh` where the browser has it, so the browser's own toolbars are not counted as space), and
   the description line under the title is not shown (a screen reader still reads it), which
   gives the list one more row. On
   the app the shared dialog is bound to the window, leaving the larger safe area free at both
   ends (the dialog is centred), and the picker's list has no fixed height. The picker has no
   text field, so the keyboard does not come into it. That bound applies to every dialog of the
   app; it does not lift a dialog above the keyboard, so a dialog with a text field keeps its
   own limits (the class notify dialog's list keeps its fixed height). Known limit: a dialog
   whose fixed content is taller than the bound, which needs a very large system text size,
   draws past its card instead of running off the screen.
6. Client calls to `/api/app/lesson_instances` must use the HTTP verb the route exposes (`GET`).
   A verb mismatch fails the request and renders as an empty picker with no error surfaced
7. `GET /api/app/player_profile/{playerId}` is **coach-only**: it resolves the acting coach with
   `require_coach()` and returns **403** to a caller with no coach profile, before any query runs.
   A 500 is a violation of this rule. (Cross-coach ownership on this route is unchanged and remains
   as PAD-92 left it; this rule is only about the caller's *role*.)

8. **(PAD-834) Block 1, Informação.** One card, `player-info-card`, with four fields in this order:
   Email, Telemóvel, Nível *, Lado de jogo *. Email and phone keep PAD-731's form (rule 4): the
   value behind its icon, or "Sem email" / "Sem telefone", never a literal label. The coach's
   free-text note (`notes`, `player-notes`) and the notifications-blocked detail stay under the
   four fields, as today. The block has its own **Editar** (`player-info-edit`). In edit mode
   the four fields and the note are editable, level and side through selects
   (`player-level-select`, `player-side-select`, the ids iOS's form already uses; web's
   `player-header-level-select` goes); **Cancelar** (`player-info-cancel`) discards the draft and
   sends nothing; **Guardar** (`player-info-save`) sends one `POST /api/app/edit_player` with only
   the keys that changed (`players.edit` rules 1, 4).
   - **Phone:** editable for every player, as `players.edit` rule 4 already states and as iOS and
     the server already do. The web card's lock to inactive players (`PlayerInfoCard.tsx:60`) is
     a web-only drift and goes.
   - **Email:** editable only for a player of `const:PENDING_REGISTRATION`; read-only for every
     other player, including a Google/Apple student who has no password (D2). This is the client
     side only; the server's guard is open question Q7.
   - **Required level and side.** A select is required only when it has options: Lado always has
     them; Nível only when the coach has at least one level (`players.create` rule 8 allows none).
     A required select carries the asterisk. Guardar is disabled while a required select is empty
     **only in an edit opened by "Completar informação"** (rule 9), the session whose purpose is to
     complete the player. In an edit opened by Block 1's Editar, a required select that was already
     empty and was not touched does not block saving another field (a phone, an e-mail, a note): a
     legacy or deleted-level player stays editable. Neither select offers an empty option
     (`players.edit` rule 4), so a set value cannot be cleared here. The server rule does not
     change.
   - In read mode a missing level or side shows **"Por definir"** with the amber highlight
     (`player-info-level-unset`, `player-info-side-unset`); an empty email shows **"Preenchido no
     registo"** for a player of `const:PENDING_REGISTRATION` and "Sem email" otherwise.
   - The header's Editar (`player-edit`, both shells), Block 1's Editar and "Completar informação"
     are never active together: while the header or Block 1 is in edit mode, the other two are
     disabled.
9. **(PAD-834) Needs configuring.** A player of `const:NEEDS_CONFIGURING` shows, above the blocks,
   an amber alert (`player-needs-config-alert`, `data-tone="warning"`): "Complete o perfil do
   jogador", then "Falta definir:" naming exactly what is missing (nível; lado de jogo; or both).
   Its one control, **Completar informação** (`player-needs-config-complete`), opens Block 1 in
   edit mode with the required-field rule of rule 8; on web it moves focus to the first missing
   select, on iOS it scrolls Block 1 into view (the select is a picker sheet, which takes no
   focus). The alert holds no selects. Beside the name the header shows the amber chips **"Sem
   nível"** (`player-chip-no-level`, replacing today's grey "Sem nível" badge) and/or **"Sem
   lado"** (`player-chip-no-side`). Alert, chips and "Por definir" follow the saved row, not the
   draft: they go once the server's answer to Guardar has both set.
10. **(PAD-834) Block 2, Avaliações.** It reads `GET /player/<id>/evaluations`
    (`evaluations.history` rule 1) and, for its right column, the evolution read
    (`evaluations.evolution` rule 2). Every figure is the server's (R-048).
    - Block header, always shown: **"Histórico (N)"** (`player-evaluations-open`, the id the
      summary card's open button carries today on both shells; N = the number of records, 0
      included), which opens the drawer (`evaluations.history` rule 3); **"Nova avaliação"**
      (`profile-evaluations-new`), which opens the drawer with the form open
      (`evaluations.history` rule 4). Keeping "Histórico (0)" keeps the one entry id every
      existing drawer test uses.
    - Under the header, the date line `evaluation-card-last` keeps its id and text
      (`evaluations.history` rule 2: "Última avaliação em {d Mmm aaaa}." or "Ainda não há
      avaliações.").
    - Left, **Última avaliação** (`profile-evaluation-last`): the newest record's author, the
      signed-in coach's display name (records are per coach, `evaluations.history` rule 1; the
      Record carries no author), one line per rated competency with the read-only control of
      `evaluations.history` rule 6 (stars on a 1–5 scale), and the note. **Editar**
      (`profile-evaluation-last-edit`) only when the record is `editable` (today's,
      `evaluations.history` rule 8); it opens the drawer's form on that record.
    - Right, **Evolução** (`evaluation-evolution`, the id the drawer's section has today): the
      evolution section of `evaluations.evolution` (pills per competency, chart, Médias for the
      last month / 6 months / year, delta), shown only once the link has
      `const:EVOLUTION_MIN_RECORDS` records; with fewer, the column holds one line
      (`profile-evolution-gate`) saying the evolution appears from the second evaluation. With two
      records in one month the section shows its own state for one monthly point (one dot, no
      delta, `evaluations.evolution` rule 8); the gate is on records, not months.
    - **The drawer gives up Evolução.** From the wave that ships this block, the block owns the
      evolution section and the drawer shows the history and the form only (`evaluations.history`
      rules 3, 10). Until then the drawer keeps it.
    - No record at all: under the header and the date line, one empty state with **"Fazer
      primeira avaliação"** (`profile-evaluations-first`), which opens the drawer's form; no
      columns.
11. **(PAD-834) Pending registration.** The roster row's `pendingRegistration`
    (`players.list` rule 13, `const:PENDING_REGISTRATION`) drives the state; `isActive` and
    `validated` no longer do. Beside the name: the chip **"Registo pendente"**
    (`player-chip-pending`), in a colour that is not the amber of rule 9; it replaces today's
    destructive "Inativo" badge for a pending player (an inactive player with a password, who is
    not pending, keeps "Inativo"). Above the blocks, the alert `player-pending-alert`
    (`data-tone="pending"`): "À espera que o jogador se registe", "Adicionado há X dias" (X as
    `players.list` rule 15 computes it, "hoje" for 0, the age left out when `addedAt` is null), and
    "O jogador ainda não criou conta: partilhe de novo o link de convite para concluir o registo."
    Its control **Copiar link de convite** (`player-copy-invite-link`) puts the activation link
    (`/register/<userId>?t=<activationToken>` on the public origin, `auth.activate`) on the
    clipboard on both shells and confirms "Link copiado" **[assumption Q6]**. It is the
    activation link whichever flow created the player (`add_player` or `incomplete_player`). There
    is no SMS, e-mail or OS-share control: iOS's share button goes. The claim action of
    `players.claim` rule 4 stays inside the alert while the row is `claimable`; it links records,
    it does not invite. The alert replaces the amber "no account" panel. Blocks 2 and 3 work for a
    pending player exactly as for anyone, and the header's Desassociar reads "Cancelar convite"
    (`players.remove` rules 7, 9) **[assumption Q5]**. A player can be pending and
    needs-configuring at once: the pending alert comes first.
12. **(PAD-834) Block 3, Assiduidade.** Two cards: **Presenças** (left, `profile-attendance-card`)
    and **Faltas** (right, `profile-absences-card`), under one row of period chips
    `const:PROFILE_PERIOD_PRESETS` (1S / 1M / 1A / Época), default `const:PROFILE_PERIOD_DEFAULT`,
    that applies to both. The ranges are `presetRange`'s, on the club's day (`attendance.history`
    rule 10); Época is offered only when the coach's season has a current occurrence
    (`calendar.seasons` rule 14). There is no custom range here. Each card shows the `total` and
    the bucket chart of `GET /attendance_history` or `/absence_history` for the range (the same
    chart component as the pages), and a button **Ver presenças** / **Ver faltas**
    (`profile-attendance-toggle`, `profile-absences-toggle`) that shows that response's
    `sessions` as the list of `attendance.history` rule 13 / `attendance.absences` rule 8 inside
    the card, with no navigation; pressing it again hides the list. An open list ends with **"Ver
    página completa"** (`profile-attendance-full`, `profile-absences-full`), which opens the full
    page for that player (`/players/:id/attendance|absences`, iOS `/attendance?playerId=`,
    `/absences?playerId=`), so the custom range of `attendance.history` rules 10–12 stays one tap
    away (decision D6). A change of period refreshes both cards and an open list. A card whose
    total is 0 shows its empty message and its button is disabled. No attendance rate is shown
    (D5).
13. **No new endpoint.** The profile reads only `GET /coach_players` (the row, with
    `pendingRegistration` and `addedAt`), the evaluations and evolution reads, and the attendance
    and absence histories. Implementation note, not a criterion: the pages and Block 3 should
    share one fetch per kind (a hook over the page's current fetch).
14. **App Store builds already installed** keep working: the roster fields are additive and no
    endpoint changes shape (`evaluations.legacy-client-contract` rule 4 for `GET /player_profile`).
15. **Nothing moves under the finger.** Opening an inline list grows its own card downward only;
    the blocks never reorder; an alert or chip leaves only on the server's answer.
16. **Test ids that move or change behaviour** (both shells share them):
    - leave the profile: `player-attendance-link`, `player-absences-link` (replaced by the
      toggles of rule 12), `player-evaluations-action` (the header's), `player-no-account`,
      `player-register-link`, `player-share-register-link` (replaced by `player-pending-alert`
      and `player-copy-invite-link`), web's `player-header-level-select`;
    - change behaviour: `player-edit` (header; name and nickname only), `player-save` (the header
      form's save), `player-level-select`, `player-side-select`, `player-notes` (now in Block 1,
      behind `player-info-edit`), `pending-registration-badge` (follows `pendingRegistration`);
    - new: `player-info-edit`, `player-info-save`, `player-info-cancel`,
      `player-info-level-unset`, `player-info-side-unset`, `player-needs-config-alert`,
      `player-needs-config-complete`, `player-chip-no-level`, `player-chip-no-side`,
      `player-chip-pending`, `player-pending-alert`, `player-copy-invite-link`,
      `profile-evaluations-new`, `profile-evaluations-first`, `profile-evaluation-last`,
      `profile-evaluation-last-edit`, `profile-evolution-gate`, `profile-attendance-card`,
      `profile-absences-card`, `profile-attendance-toggle`, `profile-absences-toggle`,
      `profile-attendance-full`, `profile-absences-full`;
    - kept: `player-remove`, `player-add-to-classes`, the waiting-list action, `evaluation-card`,
      `evaluation-card-last` (the date line), `player-evaluations-open` ("Histórico (N)"),
      `evaluation-evolution`, `player-info-card`, `sw-section` (until Q4).

### Not this spec
- No invitation by SMS or e-mail, and no new or reissued `PlayerInvitation` (Q6).
- No attendance rate (the ticket's optional item; D5).
- No custom date range in Block 3; the full pages keep theirs.
- No server-side requirement for level or side; only the profile's form requires them.
- No change to the server's e-mail guard in this spec (Q7).

### Today (read 2026-11-13; W = `frontend/apps/web`, M = `frontend/apps/mobile`, B = `backend/padel_app`)
- Web profile: `W/src/pages/PlayerDetailPage.tsx` (whole-card edit `isEditing`, `handleEditSave`
  one `editPlayer` call; `PageActions` with Presences, Absences, Add to classes, Waiting list,
  Evaluations, Remove); `W/src/components/players/detail/PlayerHeader.tsx` (level/side selects in
  edit mode; the amber dashed "no account" panel at 241–268 shown when `!player.isActive`, link
  built at 84–86 from `activationToken`, copy to clipboard, then `ClaimLinkAction`);
  `PlayerInfoCard.tsx` (email, phone, notes, blocked detail); `PlayerStrengthsWeaknesses.tsx`;
  `W/src/components/evaluations/EvaluationSummaryCard.tsx` (date only).
- iOS profile: `M/app/player/[playerId].tsx` (action row with `player-attendance-link`,
  `player-absences-link`, `player-evaluations-action`, `player-remove`; `player-no-account`
  panel when `!player.isActive` at 608, with `player-register-link` and an OS share
  `player-share-register-link`, not a clipboard copy; `lockEmail={player.validated}` at 500); no
  pending chip by the name (grep for `validated|pending` finds only the email lock).
- Pending today means three different things: web list `!validated` (`PlayersPage.tsx` ~368),
  web and iOS detail `!isActive`, server `activationToken` only while `status == inactive`
  (`player_service._activation_token_if_inactive`, 140). A Google/Apple sign-up creates an
  `active` user with `password_hash=None` (`registration_service.py` 440 → `_create_account`
  `status="active"`), so the web list would mark that student "Registo pendente" today.
- "Added X days ago": `coach_in_player.created_at` (inherited `Model.created_at`, ORM default
  only) is serialised nowhere; `_serialize_coach_player_relation` (265–330) and
  `Player.coach_player_info` must both carry the new keys.
- Attendance pages own their fetch and range (`W/src/pages/AttendancePage.tsx`,
  `AbsencesPage.tsx`; `M/app/attendance.tsx`, `absences.tsx`); presets incl. `season` in
  `W/src/components/attendance/dateRanges.ts` `presetRange` and `M/src/features/attendance/date-ranges.ts`.
- Pinned by (each is listed with its new assertion in the draft's CHANGES.md, "Tests that
  change"): `W/src/pages/PlayersPage.masterDetail.test.tsx` (e), `PlayersPage.nickname.test.tsx`,
  `PlayerEvaluationsDrawer.test.tsx`; Playwright `players/master-detail`,
  `players/claim-existing-account`, `players/set-player-level`, `players/player-removal`,
  `players/validation-watermark`, `player-management/player-side-both`,
  `player-management/search-edit-player`, `player-management/clear-player-notes`,
  `player-management/ticket-pad-105-coach-no-username`, `player-management/players-sort-filter-alerts`,
  `attendance/attendance-history`, `evaluation-tools/evaluation-evolution`, and the
  role-name ratchet `W/src/lib/e2e-role-name-backlog.ts` (two "Edit" buttons on the page); Maestro
  `101-player-detail-action-row`, `82-clear-player-notes`, `280-level-select-scrolls`,
  `34-player-removal`, `100-players-list-rows`, `151-coach-incomplete-players`. The drawer's entry
  id `player-evaluations-open` is kept, so Maestro 57, 78, 79, 81, 98, 119, 120 and the ten
  Playwright specs that enter through it are untouched except for the evolution ones.

### Acceptance Criteria

#### PLAYERS-PROFILE-1: Player profile rejects a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/player_profile/{anyId}`
- **Then** the response status is exactly 403, and no 500 is produced

#### PLAYERS-PROFILE-2: Get player profile
- **Given** a player with id 5 who has 3 evaluation categories scored and 2 strengths noted
- **When** GET `/api/app/player_profile/5`
- **Then** the response includes player info, current evaluations (latest per category), strengths list, weaknesses list

#### PLAYERS-PROFILE-3: "Add to classes" lists this week's classes
- **Given** a coach with a class scheduled this week that has free spots
- **And** a player on that coach's roster
- **When** the coach opens the player's profile and triggers "Add to classes"
- **Then** the dialog lists that class for its weekday
- **And** selecting it and confirming enrols the player in that class instance

#### PLAYERS-PROFILE-4: The picker offers no class that has started, and cannot step back (PAD-439)
- **Given** a coach whose current week holds a class today at 00:00
- **When** they open "Add to classes" for a player
- **Then** that class is not listed (the week shows its empty state), and "previous week" is disabled
- **And** stepping to next week lists its classes, and from there "previous week" is enabled again

#### PLAYERS-PROFILE-5: The picker offers the week's last-day classes (B-192)
- **Given** a coach with a one-off class on Saturday 10 Oct 2026 at 10:00 and a weekly Saturday series
- **When** the picker asks for the Sunday-to-Saturday week `from=2026-10-04&to=2026-10-10`
- **Then** both Saturday classes are listed, and a class on Sunday 11 Oct at 00:00 is not
- **And** `to=2026-10-10T08:00:00` still ends at 08:00 (`test_b192_week_picker_includes_sunday.py`)
- Code to follow: restate `test_b192_week_picker_includes_sunday.py` with the Sunday-to-Saturday week bounds above.

#### PLAYERS-PROFILE-6: A long week scrolls inside the picker (PAD-439, B-202)
- **Given** a 1280×460 browser window and a week whose classes overflow the picker's list
  (asserted, on every weekday: the seed's next week always holds the Monday academy class and the
  Tuesday recurring class — B-193)
- **When** the coach scrolls the class list with the mouse wheel
- **Then** the last class comes into view above the Cancel/Add footer, where it can be selected

#### PLAYERS-PROFILE-7: A long week on a phone (PAD-496, B-270)
- **Given** a 360×560 phone browser and a week of 45 classes
- **When** the coach opens the picker from the player's actions menu and drags the list with a finger
- **Then** the picker is on screen and at least 536 px tall, its list window is at least 270 px (224 with the description line shown), the week's last class ends above the Cancel/Add footer, the week arrows are still on screen, and that class can be chosen
- **Given** the app and a week of fourteen classes
- **When** the coach swipes the list to the week's last class and taps it
- **Then** the Add button, disabled until then, is enabled, and the week arrows and the footer never left the screen

#### PLAYERS-PROFILE-8: The profile opens beside the roster on a wide screen (PAD-410)
- **Given** a coach on a 1280px-wide browser with players "João Silva" and "Pedro Costa"
- **When** they open `/players`, type "S" in the search, and click João's row
- **Then** the URL is `/players/<João's id>`, João's row is marked as selected, and his profile
  (header and its three blocks) shows on the right
- **And** clicking Pedro's row changes the URL and the right pane to Pedro, un-marks João's row,
  and the search box still holds "S"
test: `frontend/apps/web/src/pages/PlayersPage.masterDetail.test.tsx` › `[PLAYERS-PROFILE-8] (b) at /players/<id> the row carries aria-current and the pane renders that player` (+1 more, existing)

#### PLAYERS-PROFILE-9: The profile is a separate view on a narrow screen (PAD-410)
- **Given** the same coach on a 390px-wide browser
- **When** they open `/players/<João's id>`
- **Then** only the profile shows, with a back control to `/players`, and the roster is hidden

#### PLAYERS-PROFILE-10: The header carries four actions, on both shells (rule 4, PAD-834)
- **Given** a coach viewing a configured, registered player's profile on web or on iOS
- **Then** the header actions read, in order, Adicionar a aulas, Lista de espera, Editar,
  Desassociar, and Desassociar is styled as destructive
- **And** no header action opens presences, absences or evaluations
- The block order is PLAYERS-PROFILE-21's.
test: `frontend/apps/web/src/pages/PlayersPage.masterDetail.test.tsx` › `[PLAYERS-PROFILE-10] (e) the header carries four actions in order` (rewrite of (e))
test: `frontend/apps/mobile/src/features/players/player-detail-blocks.test.tsx` › `[PLAYERS-PROFILE-10] the header carries four actions in order` (new)

#### PLAYERS-PROFILE-11: The Informação card is translated on iOS (PAD-731, B-603)
- **Given** a player with email "ana@example.pt" and no phone, and the app in Portuguese
- **When** the coach opens the player's profile on the phone
- **Then** the card shows "ana@example.pt" and "Sem telefone", each behind its icon, and no
  "Email:" or "Phone:" label
test: `frontend/apps/mobile/src/features/players/player-contact-rows.test.tsx` › `[PLAYERS-PROFILE-11] shows the email and phone as they are` (+1 more, existing)

#### PLAYERS-PROFILE-12: Block 1 edits on its own and sends only what changed (rule 8)
- **Given** a coach on the profile of a registered student with level "Iniciação", side left, phone "912000000"
- **When** they press `player-info-edit`, change the phone, and press `player-info-cancel`
- **Then** no request is sent and the block shows the old phone in read mode
- **When** they press `player-info-edit` again, change the phone and press `player-info-save`
- **Then** one `POST /edit_player` carries `phone` and no other changed key, and the block returns to read mode with the new phone
- **And** while Block 1 is in edit mode, `player-edit` is disabled, and the e-mail is read-only
test: `frontend/apps/web/src/components/players/detail/PlayerInfoBlock.test.tsx` › `[PLAYERS-PROFILE-12] cancel sends nothing, save sends only the changed phone, the header edit waits` (new)
test: `frontend/apps/mobile/src/features/players/player-info-block.test.tsx` › `[PLAYERS-PROFILE-12] the same on iOS` (new)
test: `frontend/apps/web/e2e/player-management/search-edit-player.spec.ts` › `[PLAYERS-PROFILE-12] edits a registered student's phone through the Informação block` (amended: US-37 enters through `player-info-edit`)

#### PLAYERS-PROFILE-22: A missing level blocks only the session that completes it (rule 8)
- **Given** coach Bea with no levels at all, and her student Rui with a side and no level
- **When** she presses `player-info-edit`, changes Rui's phone and presses `player-info-save`
- **Then** the phone is saved: Nível has no options, so it is not required and carries no asterisk
- **Given** coach Ana with levels, and her student Tiago with a side and no level
- **When** she presses `player-info-edit`, leaves Nível untouched and changes the note
- **Then** `player-info-save` is enabled and the note is saved; Tiago still shows "Por definir" and the alert
- **When** she presses `player-needs-config-complete` and changes only the phone
- **Then** `player-info-save` stays disabled until a level is chosen
test: `frontend/apps/web/src/components/players/detail/PlayerInfoBlock.test.tsx` › `[PLAYERS-PROFILE-22] no levels: not required; untouched empty: not blocking; completing: blocking` (new)
test: `frontend/apps/mobile/src/features/players/player-info-block.test.tsx` › `[PLAYERS-PROFILE-22] the same on iOS` (new)

#### PLAYERS-PROFILE-13: A player with no level or no side says what is missing and leads to it (rule 9, `const:NEEDS_CONFIGURING`)
- **Given** three players: Rui with no level, Sara with no side, Tiago with neither
- **When** the coach opens each profile on web and on iOS
- **Then** each shows `player-needs-config-alert` naming exactly what is missing (nível; lado de jogo; both), the chips `player-chip-no-level` / `player-chip-no-side` beside the name accordingly, and "Por definir" on the missing Block 1 fields
- **And** the alert holds no select; pressing `player-needs-config-complete` puts Block 1 in edit mode (web: focus on the first missing select; iOS: Block 1 scrolled into view)
- **And** while the header form is open, `player-needs-config-complete` is disabled
- **When** the coach sets the missing fields and the save answers
- **Then** the alert, the chips and "Por definir" are gone
test: `frontend/apps/web/e2e/players/pad834-needs-configuring.spec.ts` › `[PLAYERS-PROFILE-13] names what is missing, completes through Informação, and the alert leaves on save` (new)
test: `frontend/apps/web/src/components/players/detail/PlayerStateAlerts.test.tsx` › `[PLAYERS-PROFILE-13] the alert text follows exactly what is missing` (new)
test: `frontend/apps/mobile/src/features/players/player-state-alerts.test.tsx` › `[PLAYERS-PROFILE-13] the same on iOS, and the complete button opens the edit mode` (new)
- Proof on iOS (Maestro, not citable): `frontend/apps/mobile/.maestro/flows/<next free number>-player-needs-configuring.yaml` (new; number from the ledger, memory "ids")

#### PLAYERS-PROFILE-14: A pending player's profile offers the invite link again and nothing else to send (rule 11, `const:PENDING_REGISTRATION`) [depends on Q6]
- **Given** a placeholder created by the test itself (not the shared seed "Ghost Player"), added today, with no e-mail
- **When** the coach opens the profile on web and on iOS
- **Then** `player-chip-pending` is beside the name, `player-pending-alert` reads "Adicionado hoje", Block 1's email reads "Preenchido no registo", and there is no share, SMS or e-mail control
- **When** they press `player-copy-invite-link`
- **Then** the clipboard holds `<public origin>/register/<userId>?t=<activationToken>`, "Link copiado" shows, and that link opens the registration form for that player
- The day arithmetic of "há X dias" is PLAYERS-LIST-18's alone.
test: `frontend/apps/web/e2e/players/pad834-pending-registration.spec.ts` › `[PLAYERS-PROFILE-14] the pending profile copies the activation link and offers no other send` (new)
test: `frontend/apps/mobile/src/features/players/player-state-alerts.test.tsx` › `[PLAYERS-PROFILE-14] copies the activation link with expo-clipboard and offers no share control` (new)
- Proof on iOS (Maestro, not citable): `frontend/apps/mobile/.maestro/flows/<next free number>-player-pending-registration.yaml` (new)

#### PLAYERS-PROFILE-15: Only a pending player shows the pending state, and only a pending player's e-mail is editable (rules 8, 11)
- **Given** an `active` student who signed up with Google (no password), an `inactive` user with a password, and a placeholder
- **When** the coach opens each profile and presses `player-info-edit`
- **Then** only the placeholder shows `player-chip-pending` and `player-pending-alert`; the inactive user with a password shows "Inativo"
- **And** only the placeholder's e-mail is editable
test: `frontend/apps/web/src/components/players/detail/PlayerStateAlerts.test.tsx` › `[PLAYERS-PROFILE-15] the pending state and the e-mail lock follow pendingRegistration, not isActive or validated` (new)
test: `frontend/apps/mobile/src/features/players/player-state-alerts.test.tsx` › `[PLAYERS-PROFILE-15] the same on iOS` (new)

#### PLAYERS-PROFILE-16: Block 2's left column is the last evaluation, editable only today (rule 10)
- **Given** João with three records, the newest today (Técnica 4 of 5, note "Bom trabalho")
- **When** the coach opens his profile
- **Then** `profile-evaluation-last` shows the coach's display name, Técnica with 4 of 5 stars and the note, and `profile-evaluation-last-edit`, which opens the drawer's form on that record
- **Given** the newest record is from an earlier day
- **Then** `profile-evaluation-last-edit` is absent
- The date line and the entry points are EVALUATIONS-HISTORY-2's; the Evolução gate is PLAYERS-PROFILE-17's.
test: `frontend/apps/web/src/components/evaluations/PlayerEvaluationsBlock.test.tsx` › `[PLAYERS-PROFILE-16] the newest record, its author, stars and note, edit only today` (new)
test: `frontend/apps/mobile/src/features/evaluations/evaluations-block.test.tsx` › `[PLAYERS-PROFILE-16] the same on iOS` (new)

#### PLAYERS-PROFILE-17: Evolução waits for the second evaluation (rule 10, `const:EVOLUTION_MIN_RECORDS`)
- **Given** Rui with one record and João with two
- **When** the coach opens each profile
- **Then** Rui's Evolução column is `profile-evolution-gate` with no chart
- **And** João's is `evaluation-evolution` (pills, chart, Médias), and the drawer opened from `player-evaluations-open` has no Evolução section
test: `frontend/apps/web/src/components/evaluations/PlayerEvaluationsBlock.test.tsx` › `[PLAYERS-PROFILE-17] one record shows the gate, two show the evolution` (new)
test: `frontend/apps/mobile/src/features/evaluations/evaluations-block.test.tsx` › `[PLAYERS-PROFILE-17] the same on iOS` (new)
test: `frontend/apps/web/e2e/evaluation-tools/evaluation-evolution.spec.ts` (amended: reads the evolution in the profile block, not in the drawer)

#### PLAYERS-PROFILE-18: Block 3 reads one period for both cards and lists inside the card (rule 12, `const:PROFILE_PERIOD_PRESETS`, `const:PROFILE_PERIOD_DEFAULT`)
- **Given** a student with 3 presences and 1 absence this month and 5 presences earlier this year
- **When** the coach opens the profile
- **Then** the period is 1M, Presenças shows 3 and Faltas 1, each with its chart
- **When** they press `profile-attendance-toggle`
- **Then** the 3 sessions are listed inside `profile-attendance-card` and the URL has not changed
- **When** they pick 1A
- **Then** Presenças shows 8 and Faltas 1, and the open list shows 8 rows
- **Given** a student with no presence and no absence in the period
- **Then** both cards show their empty message and both toggles are disabled
test: `frontend/apps/web/e2e/attendance/pad834-profile-attendance-block.spec.ts` › `[PLAYERS-PROFILE-18] one period for both cards, the list opens in place, empty disables` (new)
test: `frontend/apps/web/src/components/players/detail/PlayerAttendanceBlock.test.tsx` › `[PLAYERS-PROFILE-18] totals and lists follow the shared period` (new)
test: `frontend/apps/mobile/src/features/attendance/attendance-block.test.tsx` › `[PLAYERS-PROFILE-18] the same on iOS` (new)
- Proof on iOS (Maestro, not citable): `frontend/apps/mobile/.maestro/flows/<next free number>-player-attendance-block.yaml` (new)

#### PLAYERS-PROFILE-19: Época is offered only with a current season (rule 12)
- **Given** coach Ana whose season 1 Sep → 31 Jul has a current occurrence, and coach Bea with no season
- **When** each opens a player's profile
- **Then** Ana sees 1S, 1M, 1A, Época, and Época asks both histories for the occurrence's `from`/`to`; Bea sees 1S, 1M, 1A
test: `frontend/apps/web/src/components/players/detail/PlayerAttendanceBlock.test.tsx` › `[PLAYERS-PROFILE-19] the season chip needs a current occurrence` (new)
test: `frontend/apps/mobile/src/features/attendance/attendance-block.test.tsx` › `[PLAYERS-PROFILE-19] the same on iOS` (new)

#### PLAYERS-PROFILE-20: A pending player is evaluated and taken to classes like anyone (rule 11)
- **Given** a placeholder created by the test itself
- **When** the coach adds an evaluation from Block 2 and adds the player to a class from the header
- **Then** both succeed, Block 2 shows the new last evaluation, and the pending alert is still shown
test: `frontend/apps/web/e2e/players/pad834-pending-registration.spec.ts` › `[PLAYERS-PROFILE-20] a pending player can be evaluated and added to a class` (new)

#### PLAYERS-PROFILE-21: The three blocks follow the header in order, on both shells (rule 4)
- **Given** a coach viewing a registered, configured player's profile on web at 1280 px, on web at 390 px, and on iOS
- **Then** Informação, Avaliações and Assiduidade follow the header in that order
- **And** at 1280 px each block's two columns sit side by side; at 390 px and on iOS the left column is above the right one
test: `frontend/apps/web/src/pages/PlayersPage.masterDetail.test.tsx` › `[PLAYERS-PROFILE-21] the three blocks follow the header in order` (new)
test: `frontend/apps/mobile/src/features/players/player-detail-blocks.test.tsx` › `[PLAYERS-PROFILE-21] the blocks render in order, left column first` (new)
- Proof on iOS (Maestro, not citable): `frontend/apps/mobile/.maestro/flows/101-player-detail-action-row.yaml` (rewritten: four header actions, three block ids in scroll order)

### Waves
Paths: `P/` = `frontend/packages`. Waves are ordered so no wave asserts what a later one builds.
1. PLAYERS-LIST-14, PLAYERS-LIST-15 — server and shared packages, no UI: `pendingRegistration`,
   `addedAt` in both serializers, the `pending` filter and the two alert counts; `P/types`
   `CoachPlayer`, `P/api` `CoachPlayersPageResponse.alerts` and params; the `@levelup/config` age
   helper (PLAYERS-LIST-18). No migration.
2. PLAYERS-LIST-16, -17, -18, -19 — the roster on web and iOS.
3. PLAYERS-PROFILE-12, -22, -13, -15 — Block 1, the header's Editar narrowed to name and
   nickname, the needs-configuring alert and chips, the pending chip and alert without the copy
   control. Header actions otherwise unchanged in this wave.
4. PLAYERS-PROFILE-16, -17, EVALUATIONS-HISTORY-2, -10, EVALUATIONS-EVOLUTION-6 — Block 2; the
   drawer gives up Evolução in the same wave.
5. PLAYERS-PROFILE-18, -19, -20, -10, -21, ATTENDANCE-HISTORY-4, -10, ATTENDANCE-ABSENCES-10, -13 —
   Block 3, then the header loses "Ver presenças", "Ver faltas" and "Avaliações" (PROFILE-10 needs
   waves 4 and 5 in place).
6. Gated on Q5 and Q6: PLAYERS-PROFILE-14, PLAYERS-REMOVE-10 — the copy control, "Cancelar
   convite".
7. Gated on Q4: strengths and weaknesses (both outcomes sketched below).

### Open questions
- **Q4 (STOP; owner).** The ticket removes "Pontos fortes e fracos". That contradicts
  `evaluations.history` rule 9 ("They are never dropped") and EVALUATIONS-HISTORY-7,
  `players.notes` rule 5 (the card is where a coach edits them, web and iOS), this spec's rule 2,
  PLAYERS-NOTES-1 ("it appears in the player's profile under strengths") and promise P-PLAYERS-1
  ("strength and weakness notes"). Not built and not amended here.
  - (a) Remove the UI on web and iOS. Amend, each with a trailer: `evaluations.history` rule 9
    (append an outcome paragraph, the rule's text stays), EVALUATIONS-HISTORY-7 (retired or
    restated as "no client shows them; the endpoints answer"), `players.notes` rule 5 and
    PLAYERS-NOTES-1, `players.profile` rules 2 and 4, P-PLAYERS-1's outcome line. Keep
    `POST /add_coach_note`, `POST /delete/coach_note` and `GET /player_profile` for App Store builds
    (`evaluations.legacy-client-contract`, cortex rule "the App Store builds' evaluation endpoints
    handle legacy categories only"). Tests that go or change: Playwright
    `evaluation-tools/player-notes.spec.ts` (US-44, US-45), Maestro `07-player-notes.yaml`, i18n
    keys `players.strengthsAndWeaknesses`, `players.strengths`, `players.weaknesses`. Existing notes
    stay in the database, unseen.
  - (b) Keep them: a fourth block after Assiduidade, or a section of Informação; no amendment.
  - Until answered, rule 4 keeps the card after Block 3, as today.
  - **Decision (lead, 2026-11-19):** no owner answer came, so PAD-834 is built without it. The
    strengths-and-weaknesses card stays where it is, unchanged, after Block 3, on web and iOS, and
    wave 7 waits for the owner. Q5 and Q6 are built as the assumptions above.
- **Q5 (owner, unanswered; assumption written).** "Cancelar convite" — assumed (a): reuse the
  placeholder delete of `players.remove` (rules 7 and 9 there); depends: `players.remove` rules 7
  and 9, PLAYERS-REMOVE-10, the label in this spec's rules 4 and 11; wave 6. Option (b),
  revoke the invitation and disconnect, keeping the placeholder, is not drafted.
- **Q6 (owner, unanswered; assumption written).** "Copiar link de convite" — assumed: the existing
  activation link (stable, never expires, no backend work); depends: rule 11, PLAYERS-PROFILE-14.
  The alternative, a fresh 7-day `PlayerInvitation` link: `reissue_player_invitation`
  (`player_invitation_service.py:23`) exists, used only by password recovery; a coach-facing route
  is missing (the stored token is hashed, `players.invite-completion` rule 2). Not drafted. Wave 6.
- **Q7 (lead/owner; open).** The server's e-mail guard (`player_service.py:753-755`) tests only
  `password is not None`, so it accepts an e-mail change for a Google/Apple student (active, no
  password). Rule 8 locks the field in the clients; closing the server path needs a
  `players.edit` amendment (lock unless `const:PENDING_REGISTRATION`). Not drafted.
- **B2 reading (lead to confirm).** The lead's decisions ask both for "changing only the phone
  keeps Guardar disabled until a level is chosen" and for "an unchanged empty field on a legacy
  player does not block saving a phone". Rule 8 reconciles them by session: blocking only in the
  edit opened by "Completar informação", never in a plain Editar (PLAYERS-PROFILE-22).
- **D1 (decided, ticket text).** The list has two alerts, "por configurar" and "registo
  pendente" ("Os dois alertas"), so "por configurar" is one alert counting `const:NEEDS_CONFIGURING`
  and filtering with `incomplete=true`, replacing the two alerts "sem nível" / "sem lado" on both
  shells. `missing_level` and `missing_side` stay in the API and in the URL (dashboard deep links,
  `dashboard.profile-completeness`), shown as an active filter with its clear. Owner may prefer
  three alerts; then PLAYERS-LIST-16 and -17 change, nothing else.
- **D2 (decided).** `const:PENDING_REGISTRATION` is the placeholder, not `!validated`: a Google or
  Apple sign-up is `active` with no password and has an account (latent PAD-30 bug the ticket
  would otherwise amplify once PAD-828 switches on). `validated` keeps its meaning
  (`players.list` rule 11).
- **D3 (decided).** The coach's free-text note stays in Informação under the four fields, edited
  by Block 1's Editar; the header's Editar edits name and nickname. The ticket's block lists four
  fields; dropping the note would be a feature cut nobody asked for (`players.edit` rule 4,
  `clear-player-notes`, Maestro 82).
- **D4 (decided).** `addedAt` is `coach_in_player.created_at`. The column is nullable with an ORM
  default and no backfill (initial migration `e5442f6c568d`; `501dcb2c12f5` backfills other
  tables only); every write path today goes through the ORM. A NULL row would leave the age out
  rather than guess from `users.created_at`.
- **D6 (decided).** The coach keeps a way to the full attendance and absence pages ("Ver página
  completa" at the end of an open list): the ticket moves the lists into the profile, but the
  custom date range lives only on those pages and nothing asked to cut it.
- **D5 (decided).** No attendance rate: optional in the ticket, and `attendance.stats`'s rate has a
  different denominator (every presence row, any status), so a third figure would disagree with it.
- **D7 (lead, 13 Nov).** Platforms: see rule 4. Android is covered by the shared Expo build and
  the Android CI lane.
- Design HTML attachments ("Ficha de Jogador.html" ×2, same size) could not be read: the signed
  URLs returned by Linear answer 401. This spec follows the ticket text, which calls the design a
  reference only.
