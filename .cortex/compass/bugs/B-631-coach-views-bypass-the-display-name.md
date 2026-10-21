---
id: B-631
title: "With the nickname as main name, the invite picker, the web class detail's invitees and about 45 other coach views and coach pushes still printed the real name"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - .specflow/specs/players/nickname.spec.md
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/player_service.py
  - frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/src/features/calendar/notify-modal.tsx
proposed_fix: "players.nickname gains the rule that holds it by construction: coach-private payloads carry the requesting coach's displayName (server), shared payloads resolve through useCoachDisplayName (client), coach-only push titles and bodies go through coach_display_name (server) while shared chat text keeps the real name, and a ratcheted source guard per app fails when a coach view prints a player-name accessor outside the helper."
opened: 2026-10-21T20:10:00Z
---

# B-631: coach views that bypass the display name (PAD-683; id unconfirmed, wave 16 range)

**Source:** owner report (PAD-683, follow-up to PAD-660): with "Usar alcunha como nome principal"
on, inviting a student to a class still shows the real name.

**What happens:** the invite picker lists students from `GET notify/groups`, whose rows
(`_serialize_cp_for_group`, notification_service.py) carry only `name`, the real name; web
`ManualNotificationModal` and mobile `notify-modal` print it. The modal's search rows come from the
coach's roster, which does carry `displayName`, and print `name` anyway. The web class detail's
invitee list, join requests and toasts print `playerName` with no `useCoachDisplayName` call
(mobile's class screen has it). A static audit (2026-10-21, ~95 name-rendering sites) found about
45 more coach views and coach-bound pushes reading the real name: presences, dashboard rows, the
claim dialog, the new-conversation picker, the invite tutorial, mobile profile dialogs, and every
push title/body sent to a coach. The full table is on PAD-683.

**What should happen:** every coach view shows the coach's display name (the nickname while the
switch is on); the student and other coaches never see it (rules 2–4).

**Evidence:** `test_pad683_coach_display_name.py`, red on origin/staging 4ba53e151:
`KeyError: 'nickname'` on the group row, `KeyError: 'displayName'` on `notify/player_search`
(rule 2 already names that endpoint as carrying it: a code defect inside an incomplete rule).

**Root cause:** rules 3 and 8 list the views that were converted in PAD-660 instead of stating the
rule for every coach view, so the invite picker's payload (never named) and the web class detail
(rule 8 named only iOS/Android for invitees and join requests) fell through, and nothing failed when
a view printed a name directly. Coach-bound pushes were never addressed. Type 2, incomplete rule.

### Change Plan

**Spec to modify:** .specflow/specs/players/nickname.spec.md. Change type: add rule 9 and criteria.
- Rule 9: (a) every coach-private payload that names a student carries the requesting coach's
  `nickname` / `nicknameAsName` / `displayName` beside the real `name`; (b) shared payloads are
  resolved on the client through `useCoachDisplayName`; (c) text sent ONLY to the coach (push
  titles and bodies, the coach's Assistant conversation) names the student through
  `coach_display_name(coach_id, player)`; text in the shared coach–student conversation keeps the
  real name (rule 4); (d) a guard per app scans non-test source for the player-name accessors and
  fails on a hit outside the helper that is not on its allowlist.
- Criteria: the invite picker shows the nickname, web and iOS; switching it off shows the real name;
  coach B's group row has no nickname; a coach push names the nickname while the shared chat text
  names the real name; the guard catches a planted bypass.

**Then:** tests red → code (PR1: server fields, invite flow, web class detail, pushes, guard with
its allowlisted backlog; PR2: the backlog to zero) → regression on players, notifications, calendar.

### Resolution

(filled in when the PRs merge)
