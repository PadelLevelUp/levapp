---
id: P-NOTIFICATIONS-8
title: "Coach's classes fill by spot type, and nobody is un-invited"
status: draft
---
# Coach's classes fill by spot type, and nobody is un-invited

## Outcome

The redesigned invitation engine (PAD-899; plan `docs/plans/invitation-engine-redesign.md`, owner's
ruling of 2026-11-11). When a class date has room, the engine works out what it needs in the coach's
terms ("a right-sider at level 3", "anyone who plays either side"), asks the best-fitting students
first and waits for them while they can still fill it. It never takes an invitation back. It replaces
P-NOTIFICATIONS-2's vacancy engine when it ships; until then P-NOTIFICATIONS-2 describes what runs.

- The class's needs are counted fresh on every change: how many are missing, how many must play each
  side, how many can play either. A never-held spot and one freed by an absence are filled the same
  way. A spot is at the class's level, never the leaver's.
- Students are asked in the coach's order: the coach's waiting list, the students' waiting list, then
  the coach's groups, each ranked by the coach's priority criteria. A student who fails a gate
  (excluded, blocked, already in the class or another at that time, said No) is never asked
  automatically, the students' waiting list included; a student the coach put on the coach's own list
  is the coach's decision and passes the coach's gates (eligibility, exclusions), never the student's
  own blocks (the owner, 2026-11-12).
- While the best group can still fill a spot, the engine waits for it. A spot it cannot fill goes to
  the next group at once, one invitation per spot, in case the better students all say yes; once the
  better group has nobody left for that kind of spot, the next gets the full number.
- The coach sets how many are asked per spot, the most counting at once, and how long an invitation
  counts. After that time it stops holding the spot but stays open until the class starts.
- Nothing is sent in quiet hours, and the clock pauses through them. After the last-invitation time
  nothing new goes out, and students who play either side are given their final side.
- If no group can fill a spot, the coach is alerted.
- Coaches may opt into rules from the scenario suite that sit beside the plan: automatic entry from
  the waiting list before the reminder hour, side-bound waiting lists, per-group waiting times, and
  groups for students of the other side.

It does not promise the student-facing answers (P-NOTIFICATIONS-9), a settings screen, or who is
eligible at all.
