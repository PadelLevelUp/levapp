---
id: import.team-onboards-a-new-coach-roster
status: implemented
implemented_by:
  - ../../impl/import/onboarding-runner.spec.md
---

# The LevApp team sets up a new coach's roster for them

## Outcome

A coach who has just joined, and who sent us their timetable in whatever form they keep it (a
screenshot of a spreadsheet is typical), opens the app and finds their students and their weekly
classes already there. They did not type anything in. The setup was done by the LevApp team, once,
for that coach only, and it can be taken back completely if it turns out to be wrong.

## Who This Is For

- **The new coach**, who gets a working account instead of an empty one.
- **The LevApp team member doing the setup** (the operator), who needs to be sure the data lands on
  the right coach, exactly once, and can be undone.

## User Journey

1. The coach sends the team their timetable.
2. The operator turns it into a setup file: the coach it is for, the students, the classes, and
   who is in which class. Anything unclear in the source is settled with the coach first.
3. The operator rehearses the setup against a copy of production and looks at the result.
4. With the owner's go, the operator runs the same setup on production.
5. The coach opens the app and finds their students and classes. The setup appears in their import
   history like an import they had made themselves.
6. If something is wrong, the setup is undone as a whole: every student, class and enrolment it
   created disappears, and nothing else is touched.

## Business Rules

1. **Only the named coach is touched.** A setup names the coach and the club it is for. If the
   account it would land on is not that coach at that club, nothing happens.
2. **A setup runs once.** The same setup can never be applied a second time, not even after it was
   undone. A correction is a new setup.
3. **All or nothing.** A setup that cannot be completed leaves nothing behind.
4. **Undo removes exactly what the setup created**, and the setup stays visible in the history as
   undone.
5. **No student is contacted.** Creating the students and putting them in classes sends no
   invitation, no message and no notification. The classes start with their notifications switched
   off; the coach turns them on when they are ready.
6. **A student is never merged into someone else's account by accident.** A student is joined to an
   existing account only when the operator said so for that student.
7. **The coach is not asked for the students' ages** (owner decision, 2026-11-05). A setup creates
   roster entries, not people who can log in. A student's age is judged if and when they activate
   an account of their own.
8. **Students' names are not published.** The setup file holds personal data and is kept outside the
   public source repository. What the repository holds is the tool.
9. **Every run is recorded**: which setup, for which coach, when, what it created, and whether it
   was undone.

## Success Metrics

Not yet measured. Candidate: time from "coach sent their timetable" to "coach sees their classes".

## Out of Scope

- The coach importing their own spreadsheet in the app: that is "Coach imports a roster
  spreadsheet".
- Reading the timetable automatically. Turning a screenshot into a setup file is done by the
  operator and checked with the coach.
- Creating the coach's account, club, levels or evaluation categories. The coach exists and has
  those before a setup runs.
- Attendance history, evaluations and notes. A setup creates students, classes and enrolments.
- A screen for this in the web or iOS app. It is a team tool run on the server.

## Notes

- Owner request, 2026-11-05: setups are saved, recorded, revertible and never run twice, "like a
  migration file". They are not database migrations: those run by themselves on every start of
  every environment.
- OPEN: where the setup files are kept (they cannot live in the public repository).
