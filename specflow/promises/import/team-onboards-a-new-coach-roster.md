---
id: P-IMPORT-2
title: "The LevApp team sets up a new coach's roster for them"
status: implemented
---
# The LevApp team sets up a new coach's roster for them

## Outcome

A new coach who sent their timetable in whatever form they keep it opens the app and finds their students and weekly classes already there, without typing anything. The LevApp team did the setup once, for that coach only, and it can be taken back completely.

- Only the named coach is touched: a setup names the coach and club, and if the account it would land on is not that coach at that club, nothing happens.
- A setup runs once and never again, not even after an undo; a correction is a new setup.
- All or nothing: a setup that cannot complete leaves nothing behind.
- Undo removes exactly what the setup created, and the setup stays in the history as undone.
- No student is contacted: no invitation, message or notification, and a class starts with notifications off unless the setup itself turns them on for that class.
- A student is joined to an existing account only when the operator said so for that student.
- The coach is not asked for students' ages (owner, 2026-11-05): a setup creates roster entries, and age is judged if and when a student activates their own account.
- The setup file holds personal data and is kept outside the public source repository; the repository holds only the tool.
- Every completed run is recorded: which setup, for which coach, when, what it created, and whether it was undone.

It does not promise the coach's own spreadsheet import, reading timetables automatically, creating the coach's account, club, levels or categories, attendance history, evaluations or notes, or a screen in the apps.
