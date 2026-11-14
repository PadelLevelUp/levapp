---
id: eligibility.rules
status: implementing
depends_on: [notifications.config, levels.coach-levels, players.create, attendance.presence, classes.instances]
serves: [P-ELIGIBILITY-2]
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
   means stronger, which is a LOWER ladder index (`_group_rule_failures` in `notification_service.py`).
   Below, `class` is the class's ladder index and `student` is the student's.
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

11. **The rule editor keeps every rule well-formed, on web and iOS.** A new rule is `level` / `same_as_class` with no `value`. A rule holds a `value` only while its operation takes one: always for the absence and attendance attributes, and for `level` only with the three `within_n_*` operations. Changing the attribute resets the operation to that attribute's first one and drops the value. The three `within_n_*` operations are one menu entry plus a direction (above, below, both), and choosing a direction changes only the operation. Removing the last rule stores `null`, not `[]`.

12. **An editor never saves a rule that needs a value without one (engine stream, fail-open finding §3
    item 4).** A rule needs a value when its attribute and operation take one: in the bar, the
    absence and attendance attributes always and `level` with the three `within_n_*` operations
    (rule 11); in the invitation groups, every attribute whose value type is not `none` in the shared
    list (`@levelup/config` `TIER_ATTRIBUTES`: the two absence counts, `attendance_rate` and
    `subscription_status`). On web and iOS, the settings screen's bar editor, the class's own bar
    (`eligibility.cascade`) and the invitation groups editor (`notifications.config` rule 7d) each
    mark such a row where it stands, saying it needs a value, and the Save that would send it is
    refused with that reason, sending nothing for that part; the coach's other edits stay held. A
    rule the coach has not finished is therefore never stored as a rule that does nothing. The two
    editors decide "needs a value" from one shared function, so a row and its Save cannot disagree.
    This rule is the clients' only; the server's refusal and what a stored blank rule does at
    evaluation are a later step (Open questions).

### Acceptance Criteria

#### ELIGIBILITY-RULES-1: Unset eligibility admits everyone
- **Given** a coach whose `eligibility_rules` is `NULL`
- **When** eligibility is computed for any student against any class
- **Then** every student on that coach's roster is eligible
- **And** the same holds when `eligibility_rules` is `[]`

#### ELIGIBILITY-RULES-2: A level rule against a class with no level admits nobody
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **And** a class instance with no `level_id` whose parent lesson has no `default_level_id`
- **When** eligibility is computed
- **Then** no student is eligible
- **And** the engine does not fall back to the whole roster

#### ELIGIBILITY-RULES-3: "Within N" follows the ladder, not level values
- **Given** a coach whose ladder is `4` (strongest), `5`, `5-` (weakest)
- **And** eligibility `[{level, within_n_of_class, value: 1}]`
- **And** a class at level `5`
- **When** eligibility is computed
- **Then** students at `4`, `5` and `5-` are eligible
- **And** with `value: 0` only students at `5` are eligible

#### ELIGIBILITY-RULES-4: Within N looks above, below, or both (PAD-481)
- **Given** a coach whose ladder has eight levels (indexes 0–7)
- **And** a class at ladder index 3
- **When** eligibility is computed with `value: 2`
- **Then** `within_n_of_class` admits indexes 1–5
- **And** `within_n_above_class` admits indexes 1–3
- **And** `within_n_below_class` admits indexes 3–5

#### ELIGIBILITY-RULES-5: N = 0 is the class's level only (PAD-481)
- **Given** a class at ladder index 3
- **When** any of `within_n_of_class`, `within_n_above_class` or `within_n_below_class` has `value: 0`
- **Then** only students at index 3 are eligible

#### ELIGIBILITY-RULES-6: A level outside the ladder never passes
- **Given** a student whose level belongs to another coach's ladder
- **When** any level rule is evaluated for that student
- **Then** the student is not eligible, with reason `level_not_in_ladder`

#### ELIGIBILITY-RULES-7: An unknown level operation fails everyone, and says so (B-257)
- **Given** a coach whose eligibility is `[{level, made_up_operation}]`
- **When** eligibility is computed for any student against a class with a level
- **Then** no student is eligible
- **And** each failure carries reason `unknown_operation`

#### ELIGIBILITY-RULES-8: Saving rejects an unknown level operation and accepts what a client round-trips (PAD-481)
- **Given** a coach
- **When** they save `eligibilityRules` holding a level rule with operation `made_up_operation`
- **Then** the save answers `400` naming `eligibilityRules` and nothing is stored
- **When** they save a list holding `within_n_above_class` and `equal_or_above_class` unchanged
- **Then** the save succeeds and the list is stored as sent
- **And** the same holds for `edit_class` with `updates.eligibilityRules`

#### ELIGIBILITY-RULES-9: Saving invitation groups accepts only the vacancy operations for level (PAD-481)
- **Given** a coach
- **When** they save `invitationGroups` with a group rule `{level, within_n_above_class, 1}`
- **Then** the save answers `400` naming `invitationGroups` and nothing is stored
- **When** they save groups whose level rules use only the five vacancy operations
- **Then** the save succeeds and the groups are stored as sent

#### ELIGIBILITY-RULES-10: Side never affects eligibility
- **Given** a coach with any eligibility rule set
- **And** a class whose effective level matches a `left`-side student
- **When** eligibility is computed
- **Then** the student's side does not change the outcome
- **And** the invitation engine still ranks and rounds by side exactly as before

#### ELIGIBILITY-RULES-11: Absence rules read the coach-scoped record
- **Given** eligibility `[{unjustified_absences, less_than_or_equal, 2}]`
- **And** a student with 3 unjustified absences with this coach
- **When** eligibility is computed for one of this coach's classes
- **Then** the student is not eligible

#### ELIGIBILITY-RULES-12: The payments option is absent from the picker
- **Given** a coach editing their standard eligibility
- **When** they open the attribute list
- **Then** only level and absence attributes are offered
- **And** no payments/subscription attribute is shown
- **And** their existing invitation-group `subscription_status` rules, if any, are untouched

#### ELIGIBILITY-RULES-13: The four older level operations pass the worked example's indexes, and N may arrive as text (rule 6)
- **Given** a ladder with indexes 0 to 7, a class at index 3 and one student at each index
- **When** eligibility is computed for each operation
- **Then** `equal_or_above_class` passes 0 to 3, `equal_or_below_class` passes 3 to 7, `one_below_or_above_class` passes 2, 3 and 4, and `same_as_class` passes 3
- **And** `within_n_above_class` with `value: "2"` passes 1, 2 and 3, as the number 2 does
test: `backend/padel_app/tests/test_pad481_level_direction.py` › `test_n_sent_as_a_string_counts_as_the_number` (+1 more)

#### ELIGIBILITY-RULES-14: The bar round-trips through the notification config, and an unset bar stays null (rules 1, 9)
- **Given** a coach with no bar
- **When** the config is read, a bar is saved, `null` is saved, and a bar is saved again followed by an unrelated setting
- **Then** the first read answers `eligibilityRules: null`; after a save it answers the saved list; after `null` it answers `null`, not `[]`; the unrelated save leaves the bar as it was
test: `backend/padel_app/tests/test_pad128_eligibility.py` › `test_eligibility_rules_round_trip_through_the_config_api`

#### ELIGIBILITY-RULES-15: The editor keeps a rule well-formed as the coach changes it (rule 11)
- **Given** the eligibility editor with the rules `level same_as_class` and `unjustified_absences less_than 3`
- **When** the coach adds a rule, changes an attribute, changes an operation, and removes rules
- **Then** the added rule is `{attribute: "level", operation: "same_as_class"}` with no value
- **And** a value survives a change of operation only when the new operation takes one, and a change of attribute resets the operation and drops the value
- **And** removing one rule leaves the other, and removing the last one stores `null`
test: `frontend/apps/mobile/src/features/settings/eligibility-rules.test.ts` › `starts on the first attribute's first operation, with no value` (+11 more)
- Code to follow: web `EligibilitySection.tsx` moves its inline rule transitions onto the shared helper (or gains its own tests of add, change attribute, change operation and remove), so the web editor is proved too.

#### ELIGIBILITY-RULES-16: Within N is one menu entry with a direction that changes only the operation (rules 6, 11; PAD-481)
- **Given** the eligibility editor on web or iOS and a rule `within_n_of_class` with N 2
- **When** the coach opens the level operations and picks a direction
- **Then** the menu offers five entries (`same_as_class`, `equal_or_above_class`, `equal_or_below_class`, `one_below_or_above_class`, `within_n_of_class`) and the stored rule shows direction both
- **And** above saves `within_n_above_class`, below saves `within_n_below_class` and both saves `within_n_of_class`, each with N still 2
- **And** picking "within N levels" again on a one-way rule keeps its direction and its N
test: `frontend/apps/mobile/src/features/settings/eligibility-rules.test.ts` › `picking within N on a one-way rule keeps its direction and N` (+15 more)

#### ELIGIBILITY-RULES-17: The settings bar editor refuses to save a rule with no value, and says why (rule 12)
- **Given** a coach on the settings screen, on web and on iOS, who adds a bar rule `unjustified_absences less_than` and leaves the value empty, or picks `level within_n_of_class` and clears N
- **When** the editor shows the row
- **Then** the row is marked as needing a value, with the reason next to it
- **When** the coach presses Save
- **Then** the save is refused naming the eligibility part and the reason, nothing is sent for `eligibilityRules`, and the edit stays on screen; once the value is filled the same Save sends it
- **And** a rule whose operation takes no value (`level same_as_class`) is never marked
test: `frontend/packages/config/src/rule-values.test.ts` › `[ELIGIBILITY-RULES-17] a bar rule needs a value exactly when its operation takes one` (+ web `frontend/apps/web/src/components/settings/EligibilitySection.test.tsx` › `[ELIGIBILITY-RULES-17] marks a rule with no value and the save is refused`, iOS `frontend/apps/mobile/src/features/settings/eligibility-section.test.tsx` › `[ELIGIBILITY-RULES-17] marks a rule with no value and the save is refused`)

#### ELIGIBILITY-RULES-18: The invitation groups editor refuses to save a group rule with no value, and says why (rule 12)
- **Given** a coach editing invitation groups, on web (old and new engine) and on iOS (the tiers editor, new engine), who adds a group rule on `justified_absences`, `attendance_rate` or `subscription_status` and leaves its value empty
- **When** the editor shows the row
- **Then** the row is marked as needing a value, with the reason next to it
- **When** the coach presses Save
- **Then** the save is refused naming the invitation groups part and the reason, nothing is sent for `invitationGroups`, and the groups stay on screen; a rule on `level`, `side` or `has_makeups` is never marked
test: `frontend/packages/config/src/rule-values.test.ts` › `[ELIGIBILITY-RULES-18] a group rule needs a value exactly when its attribute's value type is not none` (+ web `frontend/apps/web/src/components/settings/InvitationGroupsSection.blankValue.test.tsx` › `[ELIGIBILITY-RULES-18] marks a group rule with no value and the save is refused`, iOS `frontend/apps/mobile/src/features/settings/tiers-editor.blank-value.test.tsx` › `[ELIGIBILITY-RULES-18] marks a group rule with no value and the save is refused`)

#### ELIGIBILITY-RULES-19: A class's own bar refuses to save a rule with no value (rule 12, eligibility.cascade)
- **Given** a coach editing one class, on web and on iOS, who picks the class's own bar and adds `attendance_rate greater_than` with no value
- **When** the coach saves the class
- **Then** the row is marked as needing a value and the save is refused with that reason; nothing is sent for `eligibilityRules`
test: `frontend/apps/web/src/components/calendar/ClassEligibilityBlock.test.tsx` › `[ELIGIBILITY-RULES-19] a class bar rule with no value blocks the class save` (+ iOS `frontend/apps/mobile/src/features/calendar/class-eligibility-block.test.tsx` › `[ELIGIBILITY-RULES-19] a class bar rule with no value blocks the class save`)

### Today (blank rules, 2026-11-14)
- The bar editors start a new or re-attributed rule with `value: undefined` and an emptied input sets it back:
  web `frontend/apps/web/src/components/settings/EligibilitySection.tsx` (row `onValueChange` ~:110, its own
  `ELIGIBILITY_ATTRIBUTES` and `needsValue` :38-:90), iOS `frontend/apps/mobile/src/features/settings/eligibility-rules.ts`
  (`newRule`, `withAttribute`, `withOperation`, `needsValue` :103). Two copies of "needs a value" today.
- The groups editors do the same: web `InvitationGroupsSection.tsx` (attribute change ~:68, inputs ~:107, ~:120),
  iOS `tiers-editor.tsx` (`ruleForAttribute`, input :143), both on `@levelup/config` `invitation-tiers.ts`
  `TIER_ATTRIBUTES` / `ruleForAttribute` (value types `none`, `number`, `percentage`, `select`).
- Nothing blocks the Save: web's tab Save (`settings.explicit-save`, `useTabSave`, `TabSaveError` in
  `apps/web/src/context/SettingsUnsavedContext.tsx` already carries a refusal reason to the page toast); iOS
  `useSectionSave` (`apps/mobile/src/features/settings/unsaved-registry.ts`). The class bar is saved with the class
  (web `ClassEligibilityBlock` in `ClassDetailSheet.tsx`, iOS `class-eligibility-block.tsx`); that save path was
  not read in the code beyond the mount.
- What a stored blank rule does: the old `_compare` (`backend/padel_app/services/notification_service.py:1284`) and
  the new `invitation_engine/planner.py` `_compare` pass a non-numeric threshold, so the rule is ignored; a
  `within_n_*` level rule with no N reads as N = 0 (`notification_service.py` ~:1482). `subscription_status` with no
  value: not read in the code.
- Pinned today by `frontend/apps/mobile/src/features/settings/eligibility-rules.test.ts` (ELIGIBILITY-RULES-15: a
  new rule has no value, which stays true: the blank state is allowed on screen, only its Save is refused).

### Waves (blank rules)
1. ELIGIBILITY-RULES-17, ELIGIBILITY-RULES-18 — one shared "needs a value" function and the refusal copy in
   `@levelup/config` and the shared locales; the settings screen on web (`EligibilitySection`,
   `InvitationGroupsSection`, `NotificationsEngineSection`'s saver) and iOS (`eligibility-section`, `tiers-editor`,
   `auto-invite-section`'s saver).
2. ELIGIBILITY-RULES-19 — the class edit's Save on web (`ClassDetailSheet`) and iOS.
3. (later, the lead's go after `engine/fail-open` merges) the server's refusal and the evaluation of a stored blank
   rule; not in this spec yet.

### Open questions
- **Refuse at save, not fail at evaluation, for now (agent 3, engine stream; the lead can reverse it).** Failing a
  stored blank rule closed would turn a coach's half-filled rule from "ignored" into "nobody is invited"; the
  clients stop new blanks first. Rows already stored blank stay as they are until wave 3.
- **Released iOS builds still send blanks.** Until wave 3 the server accepts them, so nothing changes for those
  builds. If wave 3 makes the server refuse, a released build's whole engine Save fails with its generic failure;
  options for wave 3: refuse (and accept that), strip the blank rule on save, or keep accepting and fail it at
  evaluation. To decide at wave 3, with a count of stored blank rules.
- **Words (proposed, for the owner's approval):** the row: "Falta o valor desta regra." / "This rule needs a
  value."; the Save's reason: "Há uma regra sem valor." / "A rule has no value."

### Notes

- PAD-481 (2026-10-02): `within_n_above_class` / `within_n_below_class` were added as new
  operations rather than as a `direction` field on `within_n_of_class`. Released iOS builds
  (1.2.0 b27, 1.2.1 b28) build their operation menu from their own list. They show a directional rule
  with a blank operation and no N (visibly incomplete, not a plausible wrong rule), and they save the
  rule list back unchanged unless the coach re-picks "within N" there (the known limit in rule 6). A `direction` field would have shown as "within N" (both directions) and
  could have survived an operation switch unseen. Their invite tutorial shows a raw i18n key for the
  new operations; this is cosmetic, and they are released. App Store 1.0 and 1.1.0 have no iOS
  eligibility editor.
