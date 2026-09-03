# notifications — Notification Engine

## What this is

The invitation, reminder and messaging-preference engine that keeps a coach's roster filled and
informed: automatically refilling vacated spots, reminding players ahead of class, and giving both
coach and student control over how and when that happens.

## What it covers

- `notifications.coach-tunes-the-invitation-engine` — coach configures timing, restrictions,
  matching groups, message wording, per-class on/off, and reviews activity history
- `notifications.coach-fills-vacancies-automatically` — the engine's multi-round matching, the
  standing waiting list, and manual hand-picked invitations, all filling an open spot
- `notifications.coach-approves-replacements` — the optional coach-in-the-loop approval gate before
  replacement invitations go out
- `notifications.student-gets-class-reminders` — automatic and manually-triggered class reminders,
  and the confirm/decline flow
- `notifications.student-controls-their-notifications` — a student's own standing opt-out of
  invitations and/or reminders, visible to their coach

## Why it's grouped this way

Each business spec is one outcome a single persona can complete start to finish: the coach's
settings surface, the moment a spot actually gets filled, the coach's optional approval step, the
student's reminder flow, and the student's own opt-out — kept apart because they are triggered
differently, read by different people, and can each ship or change independently. Several leaves
(`groups`, `message-templates`, `activity`, `toggle-class`) are configuration surfaces filed under
"coach tunes the invitation engine" even though their effects show up when a spot is actually
filled or a reminder is sent — see each leaf's own Notes for the cross-reference.
