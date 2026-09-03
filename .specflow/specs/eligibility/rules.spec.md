---
id: eligibility.rules
status: draft
depends_on: [notifications.config, levels.coach-levels, players.create, attendance.presence, classes.instances]
implements: ../../specs-business/eligibility/coach-relies-on-eligibility.business.md
governed_by: []
---

# eligibility.rules


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
