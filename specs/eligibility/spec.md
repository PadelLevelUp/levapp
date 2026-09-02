# eligibility — Who May Join a Class

Eligibility is the **minimum bar** a student must meet to join a class at all. It is a floor, not an
ordering: the invitation engine's waves (`notifications.invitations`) decide who is asked *first*
among students already above the floor.

## eligibility.rules

---
id: eligibility.rules
status: draft
depends_on: [notifications.config, levels.coach-levels, players.create, attendance.presence, classes.instances]
---

### Intent
A coach defines one **standard eligibility** — the set of conditions a student must satisfy to be
allowed into a class. It is evaluated against a **class**, not against a vacancy, so it can be
answered for any future class whether or not a spot is currently open.

### Entities
- **NotificationConfig** (`notification_configs`) gains **`eligibility_rules`** (JSON, nullable).
  `NULL` means **unset**. A JSON array of rule objects `{attribute, operation, value?}` means the
  bar is those rules combined with AND.

### Rules
1. **Unset means everyone is eligible.** `eligibility_rules` is `NULL` by default and `NULL` is not
   a rule set — it is the absence of one. An empty array `[]` is equivalent to `NULL`. Neither state
   ever filters anybody out.
2. **A defined rule that cannot be satisfied excludes everybody** (PAD-86, unchanged). "No rules
   defined" and "a level rule defined against a class that has no level" are **different states**:
   the first admits everyone, the second admits nobody. An implementation that cannot distinguish
   them is wrong.
3. **v1 parameters are level and absences only.**
   - `level` — evaluated against the class's **effective level**
     (`notifications.invitations` rule 2a: instance level, falling back to the parent lesson's
     default level).
   - `unjustified_absences`, `justified_absences`, `attendance_rate` — the student's record with
     this coach, computed exactly as `notifications.invitations` already computes them.
4. **Playing side is NOT an eligibility parameter.** Side remains a *wave* criterion inside the
   invitation engine (`notifications.invitations` rules 4a/4b are unchanged). Side determines who is
   asked first; it never determines who is allowed in.
5. **Payments are not a v1 parameter.** The eligibility rule picker does not offer a payments or
   subscription option, because no payment state exists to read (the existing `subscription_status`
   invitation-group attribute and the `excludeUnpaidSubscription` restriction both read
   `users.status`, which is *account activation*, not payment). Those two shipped settings are left
   in place and untouched by this work; renaming them to say what they check is separate work.
   A real payment criterion is added once a payment-state field exists.
6. **Level operations are anchored to the class**, and the set is wider than the invitation-group
   vocabulary. All are evaluated on the coach's **ladder position** (`notifications.invitations`
   rule 4c — never the raw `display_order`):
   - `same_as_class` — the student's level is the class's level
   - `equal_or_above_class` — the student's ladder position is the class's or stronger
   - `equal_or_below_class` — the student's ladder position is the class's or weaker
   - `one_below_or_above_class` — the student is at most one ladder step away in either direction
   - `within_n_of_class` — the student is at most `value` ladder steps away in either direction
     (`value` is a positive integer)
   A student whose level is not in the coach's ladder never passes a level rule.
7. **The evaluator is shared with the invitation engine.** The existing group-rule evaluator
   (`_passes_group_rules`) is generalized to accept **a vacancy or a class** as its matching target,
   so eligibility and wave criteria are evaluated by one code path. Two evaluators would drift.
8. **Eligibility is evaluated fresh at the moment it is needed** — never snapshotted onto a vacancy,
   a request or a waiting-list row. A student's level or absence count changes over time and the bar
   must reflect the state at the moment of the decision.
9. Eligibility is read and written through `GET|POST /api/app/notify/config` alongside the rest of
   `notifications.config`, under `eligibilityRules`.
10. **Existing coaches migrate to `NULL`, not to their current `invitation_groups`.** The shipped
    default invitation groups were never a deliberate eligibility choice, and seeding them as a bar
    would permanently stop a spot from ever widening past level+side — the exact fill behaviour rule
    1 of `eligibility.enforcement` preserves. Day one after this ships, every existing coach's bar is
    open and nothing about their invitation flow changes.

### Acceptance Criteria

#### Unset eligibility admits everyone
- **Given** a coach whose `eligibility_rules` is `NULL`
- **When** eligibility is computed for any student against any class
- **Then** every student on that coach's roster is eligible
- **And** the same holds when `eligibility_rules` is `[]`

#### A level rule against a class with no level admits nobody
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **And** a class instance with no `level_id` whose parent lesson has no `default_level_id`
- **When** eligibility is computed
- **Then** no student is eligible
- **And** the engine does not fall back to the whole roster

#### "Within N" follows the ladder, not level values
- **Given** a coach whose ladder is `4` (strongest), `5`, `5-` (weakest)
- **And** eligibility `[{level, within_n_of_class, value: 1}]`
- **And** a class at level `5`
- **When** eligibility is computed
- **Then** students at `4`, `5` and `5-` are eligible
- **And** with `value: 0` only students at `5` are eligible

#### Side never affects eligibility
- **Given** a coach with any eligibility rule set
- **And** a class whose effective level matches a `left`-side student
- **When** eligibility is computed
- **Then** the student's side does not change the outcome
- **And** the invitation engine still ranks and rounds by side exactly as before

#### Absence rules read the coach-scoped record
- **Given** eligibility `[{unjustified_absences, less_than_or_equal, 2}]`
- **And** a student with 3 unjustified absences with this coach
- **When** eligibility is computed for one of this coach's classes
- **Then** the student is not eligible

#### The payments option is absent from the picker
- **Given** a coach editing their standard eligibility
- **When** they open the attribute list
- **Then** only level and absence attributes are offered
- **And** no payments/subscription attribute is shown
- **And** their existing invitation-group `subscription_status` rules, if any, are untouched

---

## eligibility.cascade

---
id: eligibility.cascade
status: draft
depends_on: [eligibility.rules, classes.instances, classes.edit, classes.recurrence]
---

### Intent
The standard eligibility is a default that a coach can adapt for a **recurring group of classes** or
for **one single class**. The most specific definition wins.

### Entities
- **Lesson** (`lessons`) gains **`eligibility_rules`** (JSON, nullable) — the bar for this recurring
  group / master event.
- **LessonInstance** (`lesson_instances`) gains **`eligibility_rules`** (JSON, nullable) — the bar
  for this single occurrence.

### Rules
1. **Resolution order, most specific first:** instance → parent lesson → coach standard. The first
   tier whose `eligibility_rules` is **not `NULL`** wins outright; tiers are **not merged**. A coach
   overriding a class replaces the bar, they do not add to it.
2. An explicit empty array `[]` at any tier is a **deliberate override meaning "everyone"** and wins
   over the tier below it. This is the only way to open a single class inside an otherwise
   restricted series, so `[]` and `NULL` must be stored and read as distinct values at the lesson
   and instance tiers.
3. **One resolver, no ad-hoc fallbacks.** Resolution lives in a single function
   (`effective_eligibility(instance_or_occurrence, coach)`), mirroring how `effective_level_id`
   already resolves instance → lesson. Every consumer — invitations, waiting list, student calendar,
   join requests, manual-add warning — calls it. Re-implementing the fallback at a call site is how
   PAD-86 happened.
4. **A non-materialized recurrence occurrence resolves at the lesson tier**, because no instance row
   exists to carry an override (`classes.instances` rule 1). Eligibility is therefore answerable for
   virtual occurrences without materializing them.
5. **Editing eligibility uses the existing scope dispatch** (`classes.edit`): `scope: "single"`
   writes the instance tier; `scope: "future"` writes the lesson tier.
6. **`scope: "future"` forks the series**, exactly as it already does for every other field: editing
   from a mid-series date splits the master lesson, and the eligibility change applies to the new
   master from that date forward. Occurrences before the split keep the old bar. The UI must not
   promise "this and future classes" any more strongly than the existing edit flow does.
7. The class-detail view shows which tier the active bar came from (standard / this series / this
   class). `LessonInstance.overridden_fields` is **not** a foundation for this — it is serialized out
   but never written by any service — so tier provenance is derived from which tier resolved.

### Acceptance Criteria

#### Most specific tier wins
- **Given** a coach standard of `[{level, same_as_class}]`
- **And** a recurring lesson overriding it with `[{level, within_n_of_class, value: 1}]`
- **And** one instance of that lesson overriding it with `[{level, equal_or_above_class}]`
- **When** eligibility is resolved for that instance
- **Then** `equal_or_above_class` is applied, and the lesson and coach rules are ignored entirely

#### Tiers do not merge
- **Given** a coach standard of `[{unjustified_absences, less_than_or_equal, 2}]`
- **And** a lesson override of `[{level, same_as_class}]`
- **When** eligibility is resolved for an occurrence of that lesson
- **Then** only the level rule applies — a student with 5 unjustified absences at the right level is
  eligible

#### An empty override opens one class inside a restricted series
- **Given** a lesson whose eligibility is `[{level, same_as_class}]`
- **And** one instance whose eligibility is explicitly `[]`
- **When** eligibility is resolved for that instance
- **Then** every student on the coach's roster is eligible for it
- **And** the other instances of that lesson still apply the level rule

#### A virtual occurrence resolves at the lesson tier
- **Given** a recurring lesson with an eligibility override and an occurrence that has never been
  materialized
- **When** eligibility is resolved for that occurrence
- **Then** the lesson's rules apply
- **And** no LessonInstance row is created by the resolution

#### Editing future occurrences forks the series
- **Given** a recurring lesson with occurrences before and after 2026-09-01
- **When** the coach changes eligibility on the 2026-09-01 occurrence with `scope: "future"`
- **Then** the change applies from 2026-09-01 forward
- **And** occurrences before that date keep the previous bar

---

## eligibility.enforcement

---
id: eligibility.enforcement
status: draft
depends_on: [eligibility.cascade, notifications.invitations, notifications.waiting-list, notifications.manual]
---

### Intent
Eligibility is a **hard wall for everything the system does automatically**, and a **warning** when
a coach acts by hand. The coach's roster always wins.

### Rules
1. **Invitation waves are capped at the bar, and otherwise unchanged.** The widening rounds of
   `notifications.invitations` keep working exactly as they do today; the final, widest wave becomes
   "everyone **eligible**" instead of "everyone". Eligibility is applied first, wave criteria second,
   priority criteria and tiebreakers third. No candidate above the last wave was ever below the bar.
2. **Waiting-list placement is hard-gated.** `_check_waiting_list` admits only candidates who pass
   `effective_eligibility()` for that class. Waiting-list candidates are **not** subject to wave
   criteria — they are not being invited in rounds, they are being placed — so they are filtered by
   eligibility and ranked by the configured priority criteria.
3. **Adding a student to the standing waiting list is a coach action and is warn-only** (rule 6).
   Automatic *placement* from that list is hard-gated (rule 2). These are different moments and must
   not be conflated.
4. **A student is never placed into a class they are already in.** The waiting-list fill excludes any
   candidate who already has an enrolment association for that instance, **or** a presence for it
   with status `absent`. Without the second exclusion the student whose cancellation created the
   vacancy is placed straight back into it — see the acceptance criteria below.
5. **The waiting-list fill honours the same restrictions the invitation path honours**:
   `restrictions.excludedPlayers`, `restrictions.excludeUnpaidSubscription`, and the student
   availability-blocker filter (`calendar.student-blockers`).
6. **Manual add warns, it does not block.** When a coach adds an ineligible student to a class by
   hand, the action proceeds after an explicit confirmation. This mirrors the existing
   availability-blocker behaviour (`calendar.student-blockers` rule 4): enrolment is the coach's
   decision.
7. **The warning must name what failed**, in the coach's locale — e.g. "2 levels below this class",
   "over the unjustified-absence limit (4, limit is 2)". A bare "this student is not eligible" is not
   sufficient: the reason is what makes it a decision instead of a nag. One line per failed rule.
7a. **(PAD-133)** The backend reports failures as **structured data, never prose** — the locale
   belongs to the client. Each record is
   `{attribute, operation, actual, threshold, ladder_distance, reason}`. `actual` is the student's
   real value (a level code, a *count*, a percentage — never a bool, or rule 7's "(4, limit is 2)"
   cannot be rendered); `ladder_distance` is **signed**, negative meaning the student is stronger
   than the class, which is what lets the client say "below" rather than a direction-less "away";
   `reason` names the fail-closed cases (`class_has_no_level`, `student_has_no_level`,
   `level_not_in_ladder`) where `actual`/`threshold` cannot be meaningful.
7b. **(PAD-133)** `passes_eligibility` and the reason-reporting call MUST run the **same evaluator**,
   with the bool being defined as "no failures". Two evaluators would let the verdict drift from the
   explanation — warning about a student who is then enrolled silently, or enrolling one just called
   ineligible. The shared evaluator takes a short-circuit flag: the invitation engine keeps stopping
   at the first failure, so the hot matching loop never pays for the extra absence/attendance queries
   that a full explanation needs. Only the coach-facing path evaluates every rule.
7c. **(PAD-133)** The check is a **separate read-only endpoint**
   (`POST /api/app/notify/eligibility_check`), not a hook inside the class-edit save. Rule 6 warns
   and never blocks, so the save path is unchanged and a client that ignores the check cannot be
   prevented from enrolling anyone. It returns only the students who FAIL, so an empty list means
   "no confirmation needed".
8. **Tightening the bar never removes anyone.** Eligibility governs *joining*, never *staying*. No
   retroactive evaluation, no auto-removal, no expiry of existing enrolments.
9. **Saving a stricter bar reports who it would have excluded**, informationally: "3 enrolled
   students no longer meet this bar". It names them, offers no bulk action, and does not block the
   save. The coach removes students through the normal flow if they choose to.
9a. **(PAD-133)** The report rides on the existing `POST /api/app/notify/config` response as
   `eligibilityImpact.affected`, and is computed **only when the request actually touched
   `eligibilityRules`** — an unrelated config save costs nothing. It is scoped to **future** classes
   (a bar cannot retroactively un-enrol anyone, so past classes are noise) and is **per class**,
   because eligibility is relative to the class's level: the same student can clear the bar for one
   class and fail another, so they appear once per class they would fail, with that class named.
   Rule 8 is unaffected — nobody is un-enrolled and nobody is notified.
10. **With an unset bar, automatic placement is unfiltered — and that is the coach's choice, not an
    engine decision.** Rule 2 gates on eligibility, so a coach who has defined no bar will still see
    waiting-list students placed into any of their classes. Rules 4 and 5 apply regardless of whether
    a bar is defined; they are unconditional correctness fixes.

### Acceptance Criteria

#### Manual add names the failed rule (PAD-133)
- **Given** a coach whose eligibility is `[{level, same_as_class}]` and a class at level `5`
- **When** they add a student two ladder steps below the class by hand
- **Then** the check reports that student with `actual: "5-"`, `threshold: "5"` and a positive
  `ladder_distance`, enough to render "2 levels below this class"
- **And** confirming enrols the student normally, because rule 6 warns rather than blocks

#### A student failing two rules gets two lines, not one (PAD-133)
- **Given** a bar with both a level rule and an unjustified-absence rule
- **When** a student fails both and the coach adds them
- **Then** the report contains one record per failed rule, not just the first
- **And** the absence record's `actual` is the student's real count, so "(4, limit is 2)" is
  renderable — a boolean would make rule 7 impossible to satisfy

#### The verdict and the explanation can never disagree (PAD-133)
- **Given** any student, any class and any bar
- **When** both `passes_eligibility` and the reason-reporting call are evaluated
- **Then** an empty failure list occurs **exactly** when the bool is `True`
- **And** this is the discriminating evidence that one evaluator backs both: forking them lets the
  coach be warned about a student who is then enrolled silently, or vice versa

#### Saving a stricter bar reports without removing (PAD-133)
- **Given** a class with 6 enrolled students, 3 of whom would fail a stricter bar
- **When** the coach saves that bar
- **Then** the response names those 3 under `eligibilityImpact.affected`
- **And** all 6 remain enrolled and none of them is notified (rule 8)

#### The widest wave stops at the bar
- **Given** a coach whose eligibility is `[{level, within_n_of_class, value: 1}]`
- **And** an open vacancy whose earlier waves have all been exhausted
- **When** the engine advances to its widest wave
- **Then** only students within one ladder step of the class are invited
- **And** students further away are not invited in any wave

#### Waiting-list placement respects the bar
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **And** a student with an active standing waiting-list entry whose level does not match a class
- **When** a vacancy opens in that class
- **Then** that student is not placed
- **And** no credit is consumed
- **And** the vacancy proceeds to normal invitations

#### A student is never placed into the spot their own cancellation created
- **Given** a student enrolled in a class who also has an active standing waiting-list entry
- **When** they cancel their attendance and the vacancy is processed
- **Then** they are not placed back into that class
- **And** no credit is consumed
- **And** the vacancy is offered to other students

#### An enrolled student is never placed into their own class
- **Given** a student already enrolled in a class who has an active standing waiting-list entry
- **When** another student's cancellation opens a vacancy in that class
- **Then** the enrolled student is not a placement candidate
- **And** the vacancy is offered to students who are not already in the class

#### Manual add of an ineligible student warns with a reason and proceeds
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **When** they add a student two levels below the class to it by hand
- **Then** a confirmation names the failed rule (e.g. "2 levels below this class")
- **And** confirming enrols the student normally
- **And** cancelling aborts the add

#### Tightening the bar leaves enrolled students in place
- **Given** a class with 6 enrolled students, 3 of whom would fail a stricter bar
- **When** the coach saves that stricter bar
- **Then** an informational note names the 3 students
- **And** all 6 remain enrolled
- **And** no notification is sent to any of them

---

## eligibility.open-spot-visibility

---
id: eligibility.open-spot-visibility
status: draft
depends_on: [eligibility.cascade, calendar.view]
---

### Intent
Students discover classes they could join **inside the calendar they already have** — not through a
separate browse screen. A coach controls whether their open spots are advertised at all.

### Entities
- **NotificationConfig**, **Lesson** and **LessonInstance** each gain
  **`open_spots_visible`** (boolean, nullable) — the coach standard and its two override tiers.

### Rules
1. A student's calendar shows, in addition to the classes they are enrolled in, any **future** class
   that is **visible** (rule 3), has an **empty spot** (rule 4), and for which the student is
   **eligible** (`eligibility.cascade`).
2. Open-spot classes render in a **distinct colour** from the student's own enrolled classes, so the
   two are never confused. They are visibly "available", not "yours".
3. **Visibility is a coach toggle that cascades exactly like eligibility** — coach standard,
   overridable per recurring group and per single class, most specific wins, tiers do not merge
   (`eligibility.cascade` rules 1–3). Coach-facing label: "make empty spots for future classes
   visible to eligible students (they can request to join)".
4. **"Has an empty spot" is the class's existing capacity measure**, not a new one:
   `effective_filled_spots < max_players` (`calendar.view` rules 8–9). For a **non-materialized**
   recurrence occurrence there are no presences, so it is the enrolment count against `max_players`
   (`calendar.view` rule 10). Both cases must be handled — future recurring occurrences are most of
   a student's forward calendar.
5. Visibility is computed at read time from the current state. No row is created, and no class is
   materialized, merely because a student looked at their calendar.
6. Only classes taught by a coach the student is on the roster of are ever shown. This feature never
   exposes classes from a coach the student has no relationship with.
7. Past classes and classes with status `canceled` or `completed` are never shown as open spots.
8. A student's own availability blocker (`calendar.student-blockers`) suppresses *solicitations*, not
   *discovery*: a blocked window still shows open spots. The student initiates here, so the
   protection the blocker exists to give is not at stake.
9. With the toggle off — at whichever tier resolves — the student's calendar is exactly what it is
   today: their enrolled classes only.

### Acceptance Criteria

#### An eligible student sees an open spot in a visible class
- **Given** a coach with the visibility toggle on and eligibility `[{level, same_as_class}]`
- **And** a future class at the student's level with 5 of 6 spots filled
- **When** the student loads their calendar
- **Then** that class appears, visually distinct from their enrolled classes
- **And** it is marked as having an open spot

#### An ineligible student sees nothing
- **Given** the same class and a student two levels below it
- **When** they load their calendar
- **Then** the class does not appear

#### A full class is not advertised
- **Given** a visible class at the student's level with all 6 spots filled
- **When** the student loads their calendar
- **Then** the class does not appear

#### A future recurring occurrence with room is advertised
- **Given** a visible recurring class that has never been materialized for next Tuesday, with 4
  enrolled players and `max_players` 6
- **When** an eligible student loads a calendar range covering next Tuesday
- **Then** the occurrence appears as an open spot
- **And** no LessonInstance row is created by the read

#### A single class can be hidden inside a visible series
- **Given** a recurring class with visibility on, and one occurrence overridden to off
- **When** an eligible student loads a range covering that occurrence
- **Then** that occurrence does not appear, and the other occurrences still do

#### The toggle off restores today's behaviour
- **Given** a coach with the visibility toggle off
- **When** any student of theirs loads their calendar
- **Then** only the classes that student is enrolled in appear
