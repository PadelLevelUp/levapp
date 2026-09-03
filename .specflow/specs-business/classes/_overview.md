# classes

## What this is

Business outcomes for the classes domain: coaches setting up and running their teaching
schedule, and students' bounded view into it.

## What it covers

- `classes.coach-schedules-recurring-classes` — a coach creates, edits, and deletes classes
  (one-off or recurring), scoped to a single occurrence or the whole future series.
- `classes.coach-runs-class-occurrences` — day-to-day operation of a class's occurrences: lazy
  materialization, coach assignment, and player enrollment at the class or occurrence level.
- `classes.student-joins-and-views-classes` — a student's privacy-scoped view of a class, and
  their ability to request an open spot for a coach to accept or reject.

## Why it's grouped this way

The first two specs split "define the class" from "operate its occurrences" because they are
different coach journeys with different cadences — scheduling happens rarely, running occurrences
happens every week. The third groups two student-facing behaviours (what a student can see, and
what a student can ask for) into one outcome about the student's bounded relationship to a class
from outside the coach's full view.
