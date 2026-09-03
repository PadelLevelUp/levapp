---
id: notifications.coach-tunes-the-invitation-engine
status: implemented
implemented_by:
  - ../../specs/notifications/config.spec.md
  - ../../specs/notifications/groups.spec.md
  - ../../specs/notifications/message-templates.spec.md
  - ../../specs/notifications/toggle-class.spec.md
  - ../../specs/notifications/activity.spec.md
---

# Coach tunes the invitation engine

## Outcome

A coach shapes how the automatic invitation engine behaves for their own academy: how soon it
starts inviting after a spot opens, how many students it contacts at once, which quiet hours and
daily limits it respects, how it decides who to ask first, and what the invitation and reminder
messages actually say. They can switch the whole engine on or off, turn it off for a single class,
and look back at a history of what it has sent. None of this requires a developer — it is all one
settings surface the coach owns.

## Who This Is For

A coach running their own padel academy, configuring how LevelUp fills vacated spots and reminds
students, and occasionally auditing what the engine has done.

## User Journey

1. The coach opens Settings → Notifications and turns on the automatic invitation engine.
2. They set timing (how long before invitations start, how soon reminders go out), restrictions
   (max simultaneous invites, max per student per day, quiet hours 22:00–07:00 club-local, minimum
   time before class), and tiebreakers (level, attendance, side, subscription status) for who gets
   asked first.
3. They define notification groups — ordered, rule-based buckets (level, side, subscription
   status) that shape the multi-round matching the engine uses when a spot opens.
4. They customize the wording of invite, confirmation, decline, reminder and waiting-list messages,
   with placeholders for the student's name, class, date, time and level, in their own language
   (pt or en). A blank template quietly falls back to the built-in wording so a student is never
   sent an empty message.
5. For one particular class they don't want the engine touching — a private lesson, say — they
   turn notifications off just for that class, leaving the rest of their schedule untouched.
6. Later, on the dashboard or in Settings, they open the notification activity feed to see what
   invitations went out, to whom, and what happened to them.

## Business Rules

- The engine configuration is per coach — one config, upserted the first time they touch it.
- The engine can be off entirely, on in fully automatic mode, or on in semi-automatic mode (see
  "Coach approves replacements"). Switching modes never edits any of the timing, restriction or
  template settings.
- Quiet hours (22:00–07:00) and the daily per-student invite cap are measured on the coach's own
  club-local clock, not server UTC — so a coach reading "22:00" off their own calendar gets exactly
  that boundary, every season of the year.
- Changing timing settings immediately reschedules every future engine job — nothing waits for a
  restart.
- Notification groups are ordered: the engine works through them in sequence when matching
  candidates for an open spot, and the coach controls that order.
- Every message template always resolves to real, non-blank text in the coach's own locale
  (weekdays, dates and times render as words a Portuguese or English reader expects, e.g.
  "quarta-feira", never "Wednesday" leaking into a Portuguese message) — a coach who never touches
  a template still gets a sensible default, and the system never sends a message that renders empty.
- Turning notifications off for one class is scoped to that class alone; it never touches the
  coach's engine-wide switch or any other class.
- The activity feed is a read-only history — reviewing it never resends or changes anything.

## Success Metrics

Not yet measured.

## Out of Scope

- The actual sending of invitations, reminders and waiting-list offers as they happen — see
  "Coach fills vacancies automatically" and "Student gets class reminders".
- The coach-in-the-loop approval step before invitations go out — see "Coach approves
  replacements".
- Who is *allowed* to join a class at all (the eligibility bar) — that is a separate setting,
  covered in the `eligibility` domain; this outcome only covers *ordering* and *wording*.

## Notes

- OPEN: `notifications.groups` and `notifications.message-templates` and `notifications.activity`
  each also feed directly into "Coach fills vacancies automatically" (matching order, invite
  wording, and the events that outcome produces). They are grouped here because their primary
  user-facing surface is the same settings page the coach tunes, not the moment a spot fills; each
  leaf's Notes section cross-references the other outcome.
- `notifications.toggle-class` is also read by the reminder scheduler and the invitation engine —
  "off" for a class silences both.
