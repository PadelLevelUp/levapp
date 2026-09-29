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

### Acceptance Criteria

#### The manual-invite groups say what they are (PAD-448)
- **Given** a coach on web Settings → Notifications
- **When** they open the "Manual invite groups" section
- **Then** it shows "The groups offered when you invite students by hand from a class. They don't affect automatic invitations, which follow Invitation groups." (pt: "Os grupos que aparecem quando convida alunos à mão numa aula. Não afetam os convites automáticos — esses seguem os Grupos de convite.")
- **And** the "Invitation groups" hint ends "Used by the automatic invitation engine." (pt: "Usados pelos convites automáticos.")

### Notes
- Secondary outcome: the matching order these groups define is what a student actually experiences
  when a spot opens — see `notifications.coach-fills-vacancies-automatically`.
