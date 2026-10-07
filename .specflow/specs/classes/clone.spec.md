---
id: classes.clone
status: implemented
depends_on: [classes.create, classes.recurrence, eligibility.cascade]
implements: ../../specs-business/classes/coach-schedules-recurring-classes.business.md
governed_by: []
---

# classes.clone

### Intent
A coach often needs a class just like one they already have — same group, same level, same days —
at another hour. "Clonar aula" (PAD-524) opens the ordinary new-class form already filled from an
existing class, so the coach only picks the start and saves. Decided with the coordinator for the
owner, 2026-10-07: one ticket for web and iOS, no decomposition, because the create path exists.

### Entities
- **READS:** `Lesson` (the series), `LessonInstance` and `Presence` (a one-off's participants),
  `Association_PlayerLesson` (a series' roster).
- **WRITES:** nothing of its own. The save is `POST /add_class` (`classes.create`).

### Rules
1. **One derivation, on the server.** `GET /class_instance/clone_template?model&id&date` (coach-only,
   and only a class the coach may read) answers the prefill, shaped as `POST /add_class` takes it
   minus the start and end times, plus `durationMinutes`. Both shells put it in their ordinary
   create form; neither computes a field.
2. **The series, never one occurrence.** Values come from the `Lesson`: an occurrence's own title,
   court, capacity or eligibility override is not copied.
3. **Students.** A recurring class: the series roster, including a student who cancelled one
   occurrence. A one-off: its participants minus anyone not coming.
4. **What is copied, set and left out:**

   | | Fields |
   |---|---|
   | **Copied** | title (as is); type; level; capacity; colour; club and court (the court only when the class is at the coach's current club, where `/add_class` creates); length; notifications on/off; the class-level auto-invite, open-spot visibility and eligibility-rule overrides; recurrence weekdays and end date, and "until season end" — as a NEW, independent series; students (rule 3) |
   | **Set by the clone** | date = the original occurrence's date; start = empty, required |
   | **Not copied** | one occurrence's own overrides; attendance and validation; invitations, vacancy offers, waiting lists (per class and standing), join requests; evaluations; the training plan; any link back to the original |

   `POST /add_class` takes `eligibilityRules` and `openSpotsVisible` (it already took `autoInvites`)
   and writes them to the new lesson's own tier, validated as `/edit_class` validates them
   (`eligibility.rules` rule 6: an unknown level operation is refused, 400 `eligibilityRules`), so
   a clone is one write.
5. **The start is the coach's.** The form opens with no start time and Create disabled until one is
   chosen (web: typed or picked; iOS: the time wheel, its placeholder "Escolhe a hora de início");
   choosing it sets the end from the original's length. This is `classes.create` rule 8b's one
   exception: the field is empty only until it is first set.
6. **The save is the ordinary create.** Nothing about a clone skips create's checks: the overlap
   warning (PAD-159) and the unavailable-student warning (`calendar.student-blockers` rule 9) run,
   and the students are told as on any create (PAD-330).
7. **Where.** Web: "Clonar aula" in the class sheet's actions (`class-clone`), coach only, on a
   class. iOS: the same button on the class screen, opening the new-class screen with the class's
   `model`, `id` and `date`.

### Acceptance Criteria

#### A series is cloned as a new, independent series (rules 1-4)
- **Given** a weekly class "Quinta 18h" on Thursdays until 17 Dec, roster Ana and Bruno, level 5,
  capacity 4, its own bar "same as class"
- **When** the coach clones its occurrence of 5 Nov
- **Then** the form shows "Quinta 18h", 5 Nov, no start, Thursdays until 17 Dec, Ana and Bruno,
  level 5, capacity 4, and Create is disabled
- **When** they pick 19:00 and create
- **Then** a new series exists 19:00-20:00 on Thursdays until 17 Dec with that bar, and the original
  is unchanged

#### An occurrence's own overrides are not copied (rule 2)
- **Given** the 5 Nov occurrence renamed "Just today"
- **When** the coach clones it
- **Then** the form says "Quinta 18h"

#### A clone cannot bypass create's checks (rule 6)
- **Given** a clone whose chosen slot overlaps another class
- **When** the coach creates
- **Then** the overlap warning asks first; with a student marked unavailable, that warning asks first

#### A one-off copies who is coming (rule 3)
- **Given** a one-off class with Ana and Bruno, Bruno not coming
- **When** the coach clones it
- **Then** the form has Ana only
