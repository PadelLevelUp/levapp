---
id: eligibility.rules
status: implemented
depends_on: [notifications.config, levels.coach-levels, players.create, attendance.presence, classes.instances]
implements: ../../specs-business/eligibility/coach-sets-the-eligibility-bar.business.md
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
     this coach, computed exactly as `notifications.invitations` already computes them. "With
     this coach" is enforced for all three since PAD-382 (B-143): before it, `justified_absences`
     and `attendance_rate` read the student's rows with every coach (`attendance.stats` rule 1).
4. **Playing side is NOT an eligibility parameter.** Side remains a *wave* criterion inside the
   invitation engine (`notifications.invitations` rules 4a/4b are unchanged). Side determines who is
   asked first; it never determines who is allowed in.
5. **Payments are not a v1 parameter.** The eligibility rule picker does not offer a payments or
   subscription option, because no payment state exists to read (the existing `subscription_status`
   invitation-group attribute and the `excludeUnpaidSubscription` restriction both read
   `users.status`, which is *account activation*, not payment). PAD-132 relabelled those two
   settings on both platforms to say what they check ("Account status", "Exclude inactive
   accounts"); their stored identifiers are unchanged (`notifications.config` rule 7c). A real
   payment criterion is added only once a payment-state field exists — none is planned.
6. **Level operations are anchored to the class**, and the set is wider than the invitation-group
   vocabulary. All are evaluated on the coach's **ladder position** (`notifications.invitations`
   rule 4c — never the raw `display_order`).
   **Direction, stated once:** the ladder is ordered strongest first, and a lower `display_order` is
   a HIGHER / stronger level (`backend/padel_app/services/level_ladder.py:6`). So "above the class"
   means stronger, which is a LOWER ladder index (`notification_service.py:944`). Below, `class` is
   the class's ladder index and `student` is the student's.
   - `same_as_class`: the student's level is the class's level.
   - `equal_or_above_class`: `student ≤ class` (the class's level or stronger).
   - `equal_or_below_class`: `student ≥ class` (the class's level or weaker).
   - `one_below_or_above_class`: `|student − class| ≤ 1`.
   - `within_n_of_class`: `|student − class| ≤ value`, in either direction. Its meaning is unchanged
     by PAD-481, so existing rules keep their recipients.
   - `within_n_above_class` (PAD-481): `class − value ≤ student ≤ class`. The class's level, or up
     to `value` steps stronger.
   - `within_n_below_class` (PAD-481): `class ≤ student ≤ class + value`. The class's level, or up
     to `value` steps weaker.
   `value` is a non-negative integer, used only by the three `within_n_*` operations. `value: 0`
   means the class's level only, for each of them. The two directional operations include the
   class's own level, as `equal_or_above_class` / `equal_or_below_class` do (coordinator decision,
   2026-10-02).
   **Worked example:** class at ladder index 3, `value: 2`, ladder indexes 0–7. The indexes that pass:
   - `within_n_of_class` → 1, 2, 3, 4, 5
   - `within_n_above_class` → 1, 2, 3
   - `within_n_below_class` → 3, 4, 5
   - for reference: `equal_or_above_class` → 0–3; `equal_or_below_class` → 3–7;
     `one_below_or_above_class` → 2, 3, 4; `same_as_class` → 3
   A student whose level is not in the coach's ladder never passes a level rule.
   **A level rule whose operation is none of these seven fails every student**, with reason
   `unknown_operation` (B-257: it used to pass everyone). The failure is reported like any other, in
   the class-edit warning and the save impact scan.
   **Saving** (`POST /api/app/notify/config` and `edit_class` `updates.eligibilityRules`) rejects a
   list holding a level rule whose operation is not one of the seven: `400`, naming
   `eligibilityRules`. A client that does not know an operation must be able to save the list back
   unchanged, so every operation in this list is accepted whether or not the posting client offers
   it. Saving `invitationGroups` likewise rejects a group whose level rule's operation is not one of
   the five vacancy operations (`same_as_vacancy`, `one_above_vacancy`, `one_below_vacancy`,
   `all_above_vacancy`, `all_below_vacancy`): `400`, naming `invitationGroups`.
   **Known limit (accepted, PAD-481):** on released iOS builds 1.2.0 (b27) and 1.2.1 (b28), a bar
   holding `within_n_above_class` or `within_n_below_class` shows a blank operation with N hidden;
   if the coach picks "within N levels" there, the build keeps N and saves `within_n_of_class`, so a
   one-way bar becomes both-ways and nothing says so. No capability gate: rewriting the operation for
   old clients would itself widen the bar when they post it back. The next iOS build carries the fix.
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

#### Within N looks above, below, or both (PAD-481)
- **Given** a coach whose ladder has eight levels (indexes 0–7)
- **And** a class at ladder index 3
- **When** eligibility is computed with `value: 2`
- **Then** `within_n_of_class` admits indexes 1–5
- **And** `within_n_above_class` admits indexes 1–3
- **And** `within_n_below_class` admits indexes 3–5

#### N = 0 is the class's level only (PAD-481)
- **Given** a class at ladder index 3
- **When** any of `within_n_of_class`, `within_n_above_class` or `within_n_below_class` has `value: 0`
- **Then** only students at index 3 are eligible

#### A level outside the ladder never passes
- **Given** a student whose level belongs to another coach's ladder
- **When** any level rule is evaluated for that student
- **Then** the student is not eligible, with reason `level_not_in_ladder`

#### An unknown level operation fails everyone, and says so (B-257)
- **Given** a coach whose eligibility is `[{level, made_up_operation}]`
- **When** eligibility is computed for any student against a class with a level
- **Then** no student is eligible
- **And** each failure carries reason `unknown_operation`

#### Saving rejects an unknown level operation and accepts what a client round-trips (PAD-481)
- **Given** a coach
- **When** they save `eligibilityRules` holding a level rule with operation `made_up_operation`
- **Then** the save answers `400` naming `eligibilityRules` and nothing is stored
- **When** they save a list holding `within_n_above_class` and `equal_or_above_class` unchanged
- **Then** the save succeeds and the list is stored as sent
- **And** the same holds for `edit_class` with `updates.eligibilityRules`

#### Saving invitation groups accepts only the vacancy operations for level (PAD-481)
- **Given** a coach
- **When** they save `invitationGroups` with a group rule `{level, within_n_above_class, 1}`
- **Then** the save answers `400` naming `invitationGroups` and nothing is stored
- **When** they save groups whose level rules use only the five vacancy operations
- **Then** the save succeeds and the groups are stored as sent

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

### Notes

- PAD-481 (2026-10-02): `within_n_above_class` / `within_n_below_class` were added as new
  operations rather than as a `direction` field on `within_n_of_class`. Released iOS builds
  (1.2.0 b27, 1.2.1 b28) build their operation menu from their own list. They show a directional rule
  with a blank operation and no N (visibly incomplete, not a plausible wrong rule), and they save the
  rule list back unchanged unless the coach re-picks "within N" there (the known limit in rule 6). A `direction` field would have shown as "within N" (both directions) and
  could have survived an operation switch unseen. Their invite tutorial shows a raw i18n key for the
  new operations; this is cosmetic, and they are released. App Store 1.0 and 1.1.0 have no iOS
  eligibility editor.
