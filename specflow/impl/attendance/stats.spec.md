---
id: attendance.stats
status: implemented
depends_on: [attendance.presence]
serves: [P-ATTENDANCE-1]
governed_by: []
---

# attendance.stats


### Intent
Calculate attendance statistics for players, used by the notification engine for ranking and restrictions.

### Rules
1. `_attendance_stats(player_id, coach_id)` returns (attendance_rate, justified_miss_rate) **over this coach's occurrences only** (PAD-382, B-143; `classes.coach-assignment` rule 4). The batched `_attendance_stats_for(player_ids, coach_id)` and the counts behind both (`_attendance_counts_for`: total, present, justified absences) take the same scope, and so do the two readers that fill the manual-invitation dialog's default groups, `_students_with_recent_absences` and `_students_with_justified_absences` (`GET /notify/groups`): what happened in another coach's classes shapes neither this coach's bar, nor their ranking, nor their dialog. The `justified_absences` eligibility attribute compares the scoped COUNT itself, not a rate multiplied back by a total. Denominator unchanged from PAD-276: every presence row on the coach's occurrences, whatever its status.
2. `_unjustified_absence_count(player_id, coach_id)` counts unjustified absences on this coach's occurrences (`classes.coach-assignment` rule 4). **An absence is a row whose `status` is `absent`** (PAD-381, B-152): the count is `status == "absent"` AND `justification == "unjustified"`. A justification left on a `present` row — they exist from before `attendance.validation` rule 21 — is not an absence. An `absent` row with NO justification (the import writes one for an empty justification cell) counts in NEITHER bucket; whether an untyped absence should count against a coach's bar is not decided here.
3. **Classes owed** (PAD-505; resolves the open question PAD-381 left — owner decision 2026-10-11; **amended 2026-11-19, history import, owner decision D2**). `makeups_owed(player_id, coach_id)` (batched: `makeups_owed_for(player_ids, coach_id)`, a fixed number of queries whatever the number of players) is justified absences minus make-ups taken, **never below 0**. A justified absence is rule 2's predicate with `justified` (`status == "absent"` AND `justification == "justified"`, this coach's occurrences; a student's own decline or cancellation ahead of the class writes exactly that pair, so it counts before the coach validates). A **make-up taken** is **an accepted invitation OR a validated guest presence**, counted **once per occurrence** (the key is `(player_id, lesson_instance_id)`: all three sources, `NotificationEvent`, `EngineInvitation` and `Presence`, carry a non-null `lesson_instance_id`, and an invitation or a presence exists only on a materialised occurrence, so no source needs a lesson-and-date key), all time, not tied to the missed class:
   - an **accepted invitation** is an invitation of this coach to that player that the student said yes to, **in either engine's store** (the old engine's `NotificationEvent` with `status == "confirmed"`; the new engine's `EngineInvitation` with `answer == "yes"` and not closed as withdrawn, `closed_reason != "withdrawn"`), **even when the student then missed the class it filled**;
   - a **validated guest presence** is a presence row on this coach's occurrence with `status == "present"` AND `validated == true` whose player holds no place on that occurrence's parent class (a guest, `attendance.validation` rule 10). Not yet validated, marked absent, or a regular of the class: not a make-up. A class joined through the student's own join request is therefore a make-up once the coach validates the student present, though no invitation was sent;
   - an occurrence that has both (the student accepted an invitation and then attended it as a guest) is **one** make-up, not two.
   `_has_makeups(player_id, coach_id)` is `makeups_owed > 0`. Both engines read this one count (`makeups_owed_for`): the old engine's `has_makeups` rule and `justified_misses` ordering, the new engine's `Student.makeups_owed`, the invitation simulation and the Presences-side figures all take the same number for the same student.
4. These stats feed into notification engine tiebreaker sorting and restriction checks. The `justified_misses` tiebreaker sorts on **classes owed** (rule 3, more owed first), not on the justified-miss rate (PAD-505): the number the coach reads in the simulation is the number the engine ranks by.

### Acceptance Criteria

#### ATTENDANCE-STATS-1: Classes owed are justified absences minus accepted invitations (rule 3, PAD-505)
- **Given** a student with 3 justified absences and 1 accepted invitation of this coach
- **Then** `makeups_owed` is 2 and `_has_makeups` is true

#### ATTENDANCE-STATS-2: An accepted invitation the student then missed is still a make-up taken (rule 3)
- **Given** 1 justified absence and 1 accepted invitation to a class the student then missed
- **Then** nothing is owed

#### ATTENDANCE-STATS-3: A class attended as a guest without an invitation is a make-up once the coach validates it (rule 3; amended 2026-11-19, D2)
- **Given** 1 justified absence and 1 class attended through the student's own join request (no invitation), marked present and validated by the coach
- **Then** nothing is owed

- **Given** the same class still unvalidated, or marked absent
- **Then** 1 class is owed

#### ATTENDANCE-STATS-4: Classes owed never go below 0 (rule 3)
- **Given** 1 justified absence and 3 accepted invitations
- **Then** nothing is owed

#### ATTENDANCE-STATS-5: A justification left on a present row is not owed (rule 3, PAD-381)
- **Given** a `present` row that still carries `justified`
- **Then** nothing is owed

#### ATTENDANCE-STATS-6: Another coach's invitation does not pay this coach's debt (rule 3, PAD-382)
- **Given** 1 justified absence with this coach and 1 accepted invitation from another coach
- **Then** 1 class is owed

#### ATTENDANCE-STATS-7: The tiebreaker ranks by classes owed (rule 4)
- **Given** Ana with 2 justified absences in 10 classes (20 %, 2 owed) and Bruno with 1 in 2 (50 %, 1 owed), and only the `justified_misses` tiebreaker on
- **When** a spot opens
- **Then** Ana is ranked before Bruno

#### ATTENDANCE-STATS-8: A coach's rates count that coach's classes only (rule 1)
- **Given** a student who missed two classes with another coach, both justified, and none with this coach
- **When** this coach's attendance rate and justified-absence rate for the student are computed
- **Then** both are 0
- **And** the other coach's rates for the same student are 0 attended of 2 and 2 justified of 2
test: `backend/padel_app/tests/test_pad382_attendance_readers_are_coach_scoped.py` › `test_another_coachs_absences_leave_this_coachs_rates_at_zero` (+1 more)

#### ATTENDANCE-STATS-9: A validated guest presence is a make-up taken (rule 3, D2)
- **Given** a student with 2 justified absences and 1 class they attended as a guest (no place in that class), validated present, with no invitation behind it
- **Then** 1 class is owed and `_has_makeups` is true

#### ATTENDANCE-STATS-10: Attending a class they belong to is not a make-up (rule 3, D2)
- **Given** 1 justified absence and a validated present row on a class the student is enrolled in
- **Then** 1 class is owed

#### ATTENDANCE-STATS-11: One occurrence pays once, whichever way it was filled (rule 3, D2)
- **Given** 2 justified absences, and one class the student accepted an invitation to and then attended as a guest, validated present
- **Then** 1 class is owed, not 0

#### ATTENDANCE-STATS-12: Both engines count the same classes owed (rule 3, D2)
- **Given** one student with 2 justified absences and a guest presence validated present, once on a coach whose invitations run on the old engine and once on a coach on the new one, and a second student whose make-up is an invitation accepted through the new engine's `EngineInvitation` (`answer == "yes"`)
- **Then** each coach's `makeups_owed` for the first student is 1 and the `has_makeups` rule and the `justified_misses` ordering see 1, and the second student's accepted invitation reduces what they owe exactly as an old-engine `NotificationEvent` `confirmed` does

#### ATTENDANCE-STATS-13: A new-engine invitation answered yes is a make-up taken, unless it was withdrawn (rule 3, D2)
- **Given** a coach on the new engine, a student with 2 justified absences, one `EngineInvitation` answered "yes", and another answered "yes" and then closed as withdrawn
- **Then** 1 class is owed
- **And** the answered-yes invitation counts even when the student then missed the class it filled

### Open questions
- **Q2 (history import, D2): other closed reasons on a new-engine invitation.** `EngineInvitation.closed_reason` is `withdrawn` | `same_hour` | `class_removed` (`models/engine_store.py`). Rule 3 excludes only `withdrawn` (engine lead's reading). An invitation answered yes and then closed `same_hour` (a placement at the same hour closed it) or `class_removed` (the class went away) still counts under this wording, though the student may never have attended a make-up. Proposal: leave as is, since a yes was given and the validated guest presence covers the case where they did attend; the owner may want `class_removed` excluded too.
- **Q1 (history import, D5): a coach-cancelled justification.** The coach's sheet marks some absences "Professor": the class did not happen for that student because the coach cancelled. The import writes them as `absent` + `justified` (owner, 2026-11-19), the only pair that today means "owed a class" (rule 3). Cost: they are indistinguishable from the student's own justified absences in the justified-absence count, the attendance rate's denominator, the `justified_absences` eligibility attribute and tiebreaker (rule 1) and the Presences tab's "Faltas justificadas" column. Options: (a) keep as is, no new value (proposal: nothing breaks, and "owed a class" is true); (b) a third justification value, `coach_cancelled`, that rule 3 counts as owed but rules 1 and the justified columns do not, touching `attendance.presence` rule 4, rule 2 here and the engine's eligibility. Not decided; (b) is a real ticket across both engines and both shells.
