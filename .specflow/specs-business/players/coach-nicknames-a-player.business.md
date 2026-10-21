---
id: players.coach-nicknames-a-player
status: draft
implemented_by:
  - ../../specs/players/nickname.spec.md
---

# Coach gives a student a private nickname

## Outcome

A coach can recognise every student at a glance: a student registered under a long name, a name
the coach does not use, or the same name as another student can carry a nickname that only that
coach sees, and the coach can choose to see it in place of the real name across their own views.

## Who This Is For

Coaches with large rosters, especially with two students who share a name.

## User Journey

1. On a student's profile, the coach types a nickname. The field warns: "Visível só para ti.
   Evita alcunhas ofensivas: o jogador pode pedir acesso aos seus dados."
2. The coach turns on "Usar alcunha como nome principal". The roster, the class detail (list and
   pop-up), the players list and profile, and the conversation list show the nickname; the profile
   and the pop-up also show the real name, smaller, underneath.
3. Searching for the student finds them by the nickname or by the real name.
4. Turning the switch off shows the real name again; the nickname stays saved until the coach
   clears it.

## Business Rules

- The nickname is private to the coach who wrote it. The student never sees it — not in their
  profile, a message, a notification, a template, an export of their data or a shared screen — and
  another coach of the same student never sees it.
- Message templates and everything sent to the student always use the real name.
- The nickname is personal data about the student held by the coach: a request for their data
  (the student's or the coach's) includes it — hence the warning on the field — it is erased when
  the student's account is deleted, and it goes when the coach–student link ends. Inside the app
  the student never sees it.

## Success Metrics

Not yet measured.

## Out of Scope

Nothing the student, or another coach, can read: the shared coach–student conversation, messages,
templates and notifications sent to the student keep the real name. Every view and notification
that only the coach sees uses the nickname while the switch is on, with no exception (PAD-683).

## Notes

- Owner approval recorded on PAD-660 (2026-10-14).
