---
id: eligibility.enforcement
status: draft
depends_on: [eligibility.cascade, notifications.invitations, notifications.waiting-list, notifications.manual]
implements: ../../specs-business/eligibility/coach-enforces-the-eligibility-bar.business.md
governed_by: []
---

# eligibility.enforcement


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
