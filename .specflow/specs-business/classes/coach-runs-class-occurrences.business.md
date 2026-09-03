---
id: classes.coach-runs-class-occurrences
status: implemented
implemented_by:
  - ../../specs/classes/instances.spec.md
  - ../../specs/classes/coach-assignment.spec.md
  - ../../specs/classes/enrollment.spec.md
  - ../../specs/classes/instance-enrollment.spec.md
---

# Coach Runs Class Occurrences

## Outcome

Once a class exists, the coach manages its actual occurrences day to day — who teaches each one,
which players are enrolled (as a standing member of the class or just for one session) — while
the system quietly creates each occurrence's record only when it's actually needed, rather than
pre-generating months of empty classes up front.

## Who This Is For

Coaches running an existing class's week-to-week occurrences.

## User Journey

1. A recurring class's upcoming Monday doesn't exist as a real record yet — the moment the coach
   opens it, a reminder for it is due, or a player is added to it, the system creates that
   occurrence behind the scenes.
2. The coach enrolls a player in the class as a whole, so they show up in every future occurrence
   automatically.
3. For a one-off case — a substitute, a guest, someone accepting an open spot — the coach adds a
   player to just that single occurrence instead.
4. The coach assigns which coach(es) teach the class, and can override who teaches a specific
   occurrence.
5. As the season goes on, the coach marks an occurrence completed, canceled, or rescheduled.

## Business Rules

- An occurrence of a recurring class isn't a real record until something needs it — this keeps
  months of empty future classes from cluttering the system.
- Creating an occurrence on demand is safe to repeat — it never creates duplicates.
- Enrolling a player at the class level means they appear in every future occurrence; enrolling
  at the occurrence level affects only that one session.
- More than one coach can be assigned to a class; occurrence-level assignment can override the
  class-level default.
- If a background step tied to creating an occurrence fails (e.g. syncing a waiting list), the
  occurrence itself must still be created successfully and usable — a side-effect failure is
  logged, never allowed to block the coach's action.

## Success Metrics

Not yet measured.

## Out of Scope

Creating or editing the class template itself (`classes.coach-schedules-recurring-classes`); a
student requesting to join an occurrence (`classes.student-joins-and-views-classes`); marking
attendance (`attendance` domain).

## Notes

None.
