---
id: notifications.groups
status: implemented
depends_on: [notifications.config]
serves: [P-NOTIFICATIONS-3]
governed_by: []
---

# notifications.groups


### Intent
Define student notification groups for organizing who gets notified.

### Rules
1. `notification_groups` in config: list of `{id, label, enabled}` groups
2. `invitation_groups`: rule-based groups with matching criteria
   - Each group has rules: `[{attribute, operation, value}]`
   - Attributes: level, side, subscription status, etc.
   - Operations: equals, not_equals, in, not_in
   - The `side` attribute with `same_as_vacancy` operation is inclusive of "both": a candidate passes when their side equals the vacancy side, OR the candidate's side is "both", OR the vacancy side is "both"/null (see notifications.invitations rule 4a)
3. Groups determine invitation round matching order
4. `GET /api/app/notify/groups` returns groups for a specific class instance
5. **Two different settings, named apart (PAD-448, coordinator 2026-09-25).** `invitation_groups`
   (rule 2) drives the AUTOMATIC engine; the web settings label is "Invitation groups" / "Grupos de
   convite", and its hint says it is used by automatic invitations. `notification_groups` (rule 1)
   only picks the quick-pick groups of the MANUAL invite dialog (rule 4, read by web
   `ManualNotificationModal` and iOS `notify-modal`); it never affects the engine. Its label is
   "Manual invite groups" / "Grupos do convite manual", with a one-line hint saying so. It is not
   legacy and is not removed. Only web has the settings editor (iOS has the dialog but no editor),
   so the copy change is web-only.
6. **The side criterion is called "Equilibrar lados da aula" / "Balance the class sides" (PAD-564).**
   Since PAD-541 the engine no longer looks for a player on the departing student's side: a freed
   spot asks first for the side the class is short of (`notifications.invitations` rule 2c, as
   PAD-565 settles it). The stored rule stays `{attribute: "side", operation: "same_as_vacancy"}`;
   only the copy changes, everywhere the criterion is named: the web editor's operation label for
   the `side` attribute (the `level` attribute keeps "Igual à vaga" / "Same as vacancy"), and the
   tutorial's rule words (`tutorials.rules.side.*`, `settings.tutorials` rule 5, both shells).
6a. **The help text under a side rule (PAD-564).** Web-only, because only web has the editor (rule
   5). An intro — "Quando abre uma vaga, convida-se primeiro o lado com menos jogadores a ir, para
   a aula ficar equilibrada:" / "When a spot opens, the side with fewer players going is asked
   first, so the class stays balanced:" — then the ticket's three examples, the counts including
   the departing player: "2 esquerda + 2 direita, falta 1 esquerda → convida esquerda." / "2 left +
   2 right, 1 left leaves → invites left."; "2 esquerda + 2 direita, falta 1 direita → convida
   direita." / "2 left + 2 right, 1 right leaves → invites right."; "3 esquerda + 1 direita, falta 1
   esquerda → convida direita (fica 2 + 2)." / "3 left + 1 right, 1 left leaves → invites right
   (ends 2 + 2)."; then one line on the special cases of `notifications.invitations` rule 2c as
   PAD-565 settles it (option A, owner 2026-10-09 via the coordinator): spots other students have
   already freed count for their side too; a player with no side or who plays both counts for
   neither and can be invited either way; an already balanced class keeps the departing player's
   side. The copy lives in `settings.invitationGroups.sideBalanceHelp.*` (pt, en).
7. **A group's default name reads in the coach's language (PAD-838).** `notification_groups` is per-coach
   data, seeded in English from `DEFAULT_NOTIFICATION_GROUPS` (`same_level` "Same level",
   `recent_absences` "Recent absences", `justified_absences` "Justified absences", `all_students` "All
   students"). Wherever a group of rule 1 is named (web `ManualNotificationModal` and its select-all
   label, web's settings editor, iOS `notify-modal` and its select-all label), a stored label still
   equal to its id's default, exactly, is shown in the reader's language
   (`settings.notificationGroups.labels.*`); any other label is the coach's own and is shown as stored.
   The stored data is never rewritten, and the server sends the label as stored. Both shells use one
   function (`notificationGroupLabel` in `@levelup/config`), whose defaults must match the backend's.

### Acceptance Criteria

#### NOTIFICATIONS-GROUPS-1: The side criterion says it balances the class (rule 6, PAD-564)
- **Given** a coach on web Settings → Invitation groups with a group holding a `side same_as_vacancy` rule
- **When** they read the rule
- **Then** its operation reads "Equilibrar lados da aula" (en: "Balance the class sides") and the level rule beside it still reads "Igual à vaga"
- **And** under it the help text gives rule 6a's intro, three examples and special-cases line
- **And** saving changes nothing in the stored rule (`side`, `same_as_vacancy`)
- **And** the "Understand invites" tutorial's round heading reads "Mesmo nível e equilibrar lados da aula" on web and on iOS

#### NOTIFICATIONS-GROUPS-2: The manual-invite groups say what they are (PAD-448)
- **Given** a coach on web Settings → Notifications
- **When** they open the "Manual invite groups" section
- **Then** it shows "The groups offered when you invite students by hand from a class. They don't affect automatic invitations, which follow Invitation groups." (pt: "Os grupos que aparecem quando convida alunos à mão numa aula. Não afetam os convites automáticos — esses seguem os Grupos de convite.")
- **And** the "Invitation groups" hint ends "Used by the automatic invitation engine." (pt: "Usados pelos convites automáticos.")

#### NOTIFICATIONS-GROUPS-3: The absence groups hold only absences from the asking coach's own classes (rule 4, PAD-382)
- **Given** a student on the rosters of coach Ana and coach Bruno, with a justified absence in one of Bruno's classes
- **When** Ana reads the groups for one of her classes
- **Then** the student is in "all students" and in neither absence group
- **And** had the absence been in one of Ana's classes, the student would be in both
test: `backend/padel_app/tests/test_pad382_attendance_readers_are_coach_scoped.py` › `test_an_absence_in_another_coachs_class_does_not_shape_this_coachs_dialog` (+1 more)

#### NOTIFICATIONS-GROUPS-4: A default group name is translated by its id, a renamed one is kept (rule 7, PAD-838)
- **Given** a group `same_level` stored as "Same level", and a group `all_students` the coach renamed "Os meus alunos"
- **When** a Portuguese reader's client names them
- **Then** the first reads "Mesmo nível" and the second "Os meus alunos"
- **And** each of the four default ids has its name in pt and en, and the four defaults match both backend seeders
test: `frontend/packages/config/src/notification-group-label.test.ts` › `[NOTIFICATIONS-GROUPS-4] a default label reads in the coach's language, a renamed one as stored` (+2 more)

#### NOTIFICATIONS-GROUPS-5: Web names the groups by rule 7 in the manual picker and in Settings (PAD-838)
- **Given** a coach whose `same_level` group still reads "Same level" and whose `all_students` group they renamed "Os do sábado"
- **When** they open the manual invite picker on web, and Settings → Manual invite groups
- **Then** both show `same_level` in the coach's language and "Os do sábado" as stored, and the picker's select-all control is named the same way
test: `frontend/apps/web/src/components/calendar/ManualNotificationModal.groupLabels.test.tsx` › `[NOTIFICATIONS-GROUPS-5] a default label is translated by its id, a renamed one is shown as stored` (+1 more)

#### NOTIFICATIONS-GROUPS-6: iOS names the groups by rule 7 in the manual picker (PAD-838)
- **Given** the same two groups
- **When** the coach opens "Notificar alunos" on iOS
- **Then** `same_level` shows in the coach's language and "Os do sábado" as stored, in the row and in its select-all label
test: `frontend/apps/mobile/src/features/calendar/notify-modal.group-labels.test.tsx` › `[NOTIFICATIONS-GROUPS-6] a default label is translated by its id, a renamed one is shown as stored`

### Notes
- Secondary outcome: the matching order these groups define is what a student actually experiences
  when a spot opens — see `notifications.coach-fills-vacancies-automatically`.
