---
id: training.coach-plans-training-for-a-class
status: implemented
implemented_by:
  - ../../specs/training/lesson-planning.spec.md
---

# Coach Plans Training For A Class

## Outcome

A coach picks which exercises from their library will be used in a specific upcoming class, so
the plan is visible on that class's detail view — and only exercises the coach actually has
access to, on a class they actually own, can be planned.

## Who This Is For

Coaches planning what a specific class occurrence will cover.

## User Journey

1. From a class's detail view, the coach opens the training-planning section.
2. They select exercises from their library (owned or followed) to attach to that occurrence.
3. The plan is saved and shows up on the class detail for anyone who opens it later.
4. The coach can remove an exercise from the plan just as easily.

## Business Rules

- A coach can only plan training for a class they own.
- Every exercise added to a plan must be one the coach has access to — owns or follows; an
  inaccessible exercise rejects the entire request, none of it partially applied.
- Planning training on a not-yet-materialized recurring class occurrence is rejected outright
  rather than silently creating that occurrence.

## Success Metrics

Not yet measured.

## Out of Scope

Building the exercise library itself (`training.coach-builds-exercise-library`).

## Notes

None.
