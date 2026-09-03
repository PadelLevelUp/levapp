---
id: notifications.coach-fills-vacancies-automatically
status: implemented
implemented_by:
  - ../../specs/notifications/invitations.spec.md
  - ../../specs/notifications/waiting-list.spec.md
  - ../../specs/notifications/manual.spec.md
---

# Coach fills vacancies automatically

## Outcome

When a player drops out of a class, the coach doesn't have to scramble to find a replacement by
phone or WhatsApp. The engine works through eligible students in ordered rounds — closest match
first, widening as needed — and invites them to take the spot, respecting the coach's timing and
restriction settings. If the engine's automatic reach isn't enough, the coach can step in and hand-
pick students to invite, or lean on a standing waiting list of students who've already asked to be
notified. Either way, the first student to say yes gets the spot, and everyone else's invitation is
retired automatically.

## Who This Is For

A coach who needs an open spot filled without manual outreach, and the students on their roster
who receive and respond to those invitations — including students holding a paid, standing spot on
the waiting list.

## User Journey

1. A student cancels their attendance for an upcoming class (or a coach marks them absent), and the
   engine notices the spot has opened.
2. The engine works through matching rounds — first students at the same level and playing side,
   then same level only, then anyone still eligible — sending invitations in small batches so it
   never floods the class chat.
3. An invited student sees the message and taps Yes or No. The first to accept gets the spot; every
   other pending invitation for that spot is retired automatically, and the class list updates.
4. If nobody in the automatic rounds accepts in time, and the coach has a standing waiting-list
   entry for a matching student, that student is placed directly into the class instead of being
   asked.
5. If the coach would rather choose by hand — for a sensitive placement, or because the automatic
   rounds came back empty — they open the manual notification picker, search their roster, and
   send invitations to exactly the students they choose.
6. Once the spot is filled, the coach sees it reflected on their calendar and class roster with no
   further action needed.

## Business Rules

- Matching widens progressively: exact level-and-side match first, then level-only, then anyone
  still eligible — so the engine tries the closest replacement before it tries everyone.
- A student marked "both sides" is a match for either a left or right vacancy, and a "both" vacancy
  accepts a player of any side; when both an exact-side and a "both" candidate are available, the
  exact-side player is offered first.
- The engine never invites past a class that has already started — a stale invitation from before
  the class began is retired rather than answered.
- A standing waiting-list entry is a pre-paid, priority claim on a future spot; it is matched at the
  moment a spot actually opens, not reserved in advance, since a student's level and record can
  change between when they join the list and when a spot appears.
- A student is never placed back into a class they just left, or into a class they're already
  enrolled in, through the waiting list.
- Manual invitations bypass the automatic matching entirely — the coach's own judgment about who to
  ask is authoritative, and the coach can select or deselect students with a single click on their
  row, name, or checkbox.
- Whichever path fills the spot, every other outstanding invitation for it is closed out — a
  student never gets a "sorry, taken" reply after having already said yes.

## Success Metrics

Not yet measured.

## Out of Scope

- The wording of the messages sent and the ordering rules the coach configures — see "Coach tunes
  the invitation engine".
- The coach-approval gate some coaches turn on before any of this fires — see "Coach approves
  replacements".
- Whether a given student is *allowed* to be invited or placed at all — governed by the
  `eligibility` domain's bar, which this engine respects but does not define.

## Notes

- OPEN: whether a student can still join a waiting list themselves (rather than only being added by
  the coach) is unresolved — see `notifications.waiting-list` Rule 1 and PAD-124. Today the waiting
  list is coach-managed in practice.
