---
id: P-ATTENDANCE-2
title: "Player confirms and manages attendance"
status: implemented
---
# Player confirms and manages attendance

## Outcome

An invited player can confirm or decline, and cancel up until the class starts. The player has one way to say they are not coming, and both they and the coach see one answer to where the player stands for a class (PAD-313); the dashboard and class detail always agree (PAD-570).

- A student's calendar shows each class once, as what it is to them: going (✓), said no ("Não vou", faded), invited ("Convite") or waiting ("Lista de espera"). Expired, answered or withdrawn invitations and left waiting places no longer show (PAD-611).
- Every enrolled player starts a class planned: on the list, not yet asked.
- "Yes" is accepted only once the player has been asked (the first reminder, or one the coach sent by hand), on web, iOS and Android, and the server refuses an earlier "yes" from any app. A class with reminders off never asks; its players can only say "no".
- A player who said "no" can come back while the class has not started: with a free spot they are seated again, and without one they are offered the waiting list. A mark the coach made stands against a later "yes", except that a coach's "Não vai" can be undone by the student before the class (PAD-684).
- A confirmed player can cancel any time before the class starts, never after. Inside the coach's deadline window (default 24 hours) it is allowed and flagged late.
- A decline before the player's normal reminder moment is proactive: never late, and it frees the spot at once.
- A player can cancel any future class on their calendar; the app opens the occurrence if needed, only for a player in that class.
- Every route of cancelling frees the spot the same way, so the invitation engine treats them alike.
- A student's own "no" and a coach marking them absent are kept apart in the record (PAD-271).
- The coach gets one notification per cancellation, naming the student and class and marked if late; the coach's phone is pushed only for a late one, and the class detail shows "cancelled by the student" with the time.
- A cancellation has no undo button; coming back is the "Afinal vou" above.

It does not promise how the freed spot is filled, or the coach's final attendance record.
