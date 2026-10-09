---
id: notifications.groups
status: implemented
depends_on: [notifications.config]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
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

### Acceptance Criteria

#### The side criterion says it balances the class (rule 6, PAD-564)
- **Given** a coach on web Settings → Invitation groups with a group holding a `side same_as_vacancy` rule
- **When** they read the rule
- **Then** its operation reads "Equilibrar lados da aula" (en: "Balance the class sides") and the level rule beside it still reads "Igual à vaga"
- **And** under it the help text gives rule 6a's intro, three examples and special-cases line
- **And** saving changes nothing in the stored rule (`side`, `same_as_vacancy`)
- **And** the "Understand invites" tutorial's round heading reads "Mesmo nível e equilibrar lados da aula" on web and on iOS

#### The manual-invite groups say what they are (PAD-448)
- **Given** a coach on web Settings → Notifications
- **When** they open the "Manual invite groups" section
- **Then** it shows "The groups offered when you invite students by hand from a class. They don't affect automatic invitations, which follow Invitation groups." (pt: "Os grupos que aparecem quando convida alunos à mão numa aula. Não afetam os convites automáticos — esses seguem os Grupos de convite.")
- **And** the "Invitation groups" hint ends "Used by the automatic invitation engine." (pt: "Usados pelos convites automáticos.")

### Notes
- Secondary outcome: the matching order these groups define is what a student actually experiences
  when a spot opens — see `notifications.coach-fills-vacancies-automatically`.
