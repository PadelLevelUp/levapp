---
id: P-NOTIFICATIONS-2
title: "Coach fills vacancies automatically"
status: implemented
---
# Coach fills vacancies automatically

## Outcome

When a player drops out, the engine works through eligible students in ordered rounds, closest match first, and invites them within the coach's timing and restrictions; the coach can also hand-pick students. Waiting-list students are always asked first, the first yes gets the spot, and every other invitation for it is retired or, when the class has another open spot the student fits, moved to that spot without a new message (PAD-679).

- Matching widens: exact level and side, then level only, then anyone still eligible.
- Every free seat (nobody going or still to answer, the coach's "K vagas") is offered. Filling one spot never hides another, nor does a spot that ran out of students: the others are offered from the invitation start, or within minutes once no other spot is open, waiting list first. A spot that ran out stays closed (PAD-763).
- Never-filled spots look first for the side the class is short of, then any side. Every yes re-counts, and a spot that now needs the other side withdraws its invitations to the side no longer needed ("Já não é preciso deste lado"); those students may join the waiting list for their side. A withdrawal is not a no (PAD-581).
- A cancellation's freed spot asks the side the class is now short of, counting students going, and keeps the leaver's side when even (PAD-541, PAD-565).
- A "both sides" student matches either side and a "both" spot accepts anyone; an exact-side candidate is offered first.
- Once a class has started nobody is invited to it, automatically or by hand: the coach sees "Esta aula já começou; já não é possível convidar." and a send on its way is refused with those words, on web and iOS; invitations already out close (PAD-798).
- The waiting list means being asked first, in the order joined, before every group. It reserves nothing: the student still answers, and eligibility is checked when the spot opens.
- A paid standing entry spends a credit only when the student says yes and gets the place. A no to a class removes them from that class's list, not their standing entry. A standing entry lasts until a date the coach picks, at most twelve months ahead, and can be renewed without losing paid classes (PAD-507).
- A student is never offered, through the waiting list, a class they just left or are in.
- A student told "Vaga preenchida" can join that class's waiting list from the message (PAD-577).
- The coach sees a class's waiting list with each student's origin and duration; adds students for that class, the whole series (every remaining class, up to twelve months) or a period; changes and removes them. Standing-list entries are managed in Settings (PAD-560). Adding someone promises nothing, and they hear nothing until a spot opens (PAD-547).
- Changing when invitations start applies to spots already open: later holds new sends, earlier starts a waiting spot within minutes; "Yes, right now" approvals and the coach's own invitations are not held (PAD-776).
- A student has one unanswered invitation per day at a time, and the coach sees why; a yes closes their other invitations that day as "Já inscrito noutra aula", following the coach's "no second class that day" setting (PAD-775).
- Opening many spots at once does not slow the app for others (PAD-788, PAD-801). When a class has sent as many invitations as the coach allows, its spots wait and do not skip to wider groups (PAD-801).
- Manual invitations bypass matching; one click on a row, name or checkbox selects a student.
- Whatever fills a spot closes or moves every other invitation for it. The student who got the spot is never told it was taken; one who answers too late is told on the invitation itself and offered the waiting list.

It does not promise the engine's wording and ordering settings, the approval gate, or who is eligible.

## Replaced when PAD-899's engine ships

P-NOTIFICATIONS-8 and P-NOTIFICATIONS-9 (draft) replace this outcome when the redesigned engine
ships; until then this page describes what runs. Reversed then: closing or moving other invitations
at a fill, withdrawing invitations for side balance and retiring them as "Vaga preenchida" (an
invitation stays open until answered or the class starts, and a late Yes gets "sorry" with the waiting-list offer, the owner having ruled out any re-offer
2026-11-12);
a freed spot asking for a side by balancing (sides come from the class's counts); one waiting list in
join order before every group (two lists, the coach's first, ranked by the coach's criteria); and
pacing by batches and rounds (invitations per spot, a session maximum and a counting time).
