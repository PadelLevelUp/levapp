---
id: classes.instance-enrollment
status: implemented
depends_on: [classes.instances, players.create]
implements: ../../specs-business/classes/coach-runs-class-occurrences.business.md
governed_by: []
---

# classes.instance-enrollment


### Intent
A student's place on one class occurrence is one `Presence` row. PAD-259 (audit H5, owner decision
of 2026-09-11, option A): the per-occurrence junction table was a second copy of the same fact,
written on different paths, and the two disagreed on production. This spec makes the presence row
the only per-occurrence enrolment and keeps the three facts a coach and a student care about as
three separate fields on it. Decision record:
`.cortex/atlas/decisions/2026-09-11-per-occurrence-enrolment-source-of-truth.md`.

### Entities
- **READS:** Presence, Association_PlayerLesson (the series roster, `classes.enrollment`)
- **WRITES:** Presence — `enrolment_source` (new, PAD-259): `roster | coach | fill | walk_in | import | unknown`,
  a CHECK-constrained string with server default `unknown`
- **SHADOW (phase 1 only):** Association_PlayerLessonInstance (`player_in_lesson_instance`) is still
  written by the single writer of rule 4 and read by nothing; phase 2 drops it

### Rules
1. **The presence row is the enrolment.** A `presences` row for `(player_id, lesson_instance_id)`
   means the player holds a spot on that occurrence. There is no other per-occurrence enrolment
   record. Deleting the row is how a player leaves an occurrence.
2. **Three separate facts on the row, never one field** (the owner's framing, 2026-09-11):
   - *planned* — the row exists; written by the coach's actions and the engine's fills;
   - *intends to come* — the student's answer (`confirmed`, or `status=absent` with
     `justification=justified` for a decline or cancellation, until PAD-271 replaces the flags with
     one response field); only the student's own actions write it;
   - *was there* — the coach's attendance record (`status` present/absent with `validated=True`,
     `justification`); only the coach writes it (`attendance.validation`).
3. **`enrolment_source`** records how the row came to exist: `roster` (copied from the series roster
   at materialisation), `coach` (added to this occurrence by the coach), `fill` (invitation
   accepted, waiting-list placement, accepted join request), `walk_in` (recorded on the attendance
   sheet after the fact), `import`, `unknown` (backfilled rows whose origin cannot be told). It is
   informational: never used for authorization or capacity.
4. **One writer.** Every path that puts a player on an occurrence calls
   `enrol(player_id, instance, source)` in `lesson_service`: materialisation (`roster`), instance
   create and edit-add (`coach`), the engine's `_add_player_to_instance` (`fill`), the attendance
   sheet walk-in (`walk_in`), the presences import (`import`). It is idempotent — an existing row is
   returned untouched, its response and attendance never reset — and in phase 1 it also writes the
   shadow junction row. It is race-safe without a lock: the unique pair is the lock, so the insert
   runs in a savepoint and a concurrent winner's collision is rolled back and re-read. It flushes
   inside a unit of work and commits outside one (PAD-272), so a roster materialises in one commit.
   `unenrol(player_id, instance)` deletes the row and the shadow. No other code constructs a
   `Presence` for an enrolment.
5. **Capacity** is presences minus those with `status = 'absent'`, floored at 0 — the same
   arithmetic as before, now over one table (`calendar.view` rules 8–9, `LessonInstance.effective_filled_spots`).
6. **Reads.** "Is this player in this occurrence", the class-detail participants list, the engine's
   roster fan-out, eligibility and vacancy snapshots, the coach and student calendars all read
   presences. The series roster (`player_in_lesson`) remains the source for occurrences that have
   no instance row yet (`classes.instances` rule 1).
7. **A reminder answer from a player who has no row** on that occurrence (removed from that date
   after the reminder went out, still on the series roster) is recorded on the reminder attempt so
   the bubble settles and no re-reminder fires, and is answered with "you are no longer in this
   class"; it never creates a row or a vacancy (owner decision 2026-09-11, replacing the PAD-69
   auto-create; the PAD-69 intent — an answer is never silently lost — stands). Removing a
   participant from an occurrence also retires their pending reminder bubble.
8. **Migration and backfill (phase 1).** One guarded migration: add `enrolment_source`; one
   `INSERT … SELECT` that creates a presence (`invited=True`, `enrolment_source` `roster` when the
   series roster has the pair else `coach`) for every junction row without one, skipping rows whose
   player or instance no longer exists (B-059); stamp `roster`/`coach` on existing presences that
   have a junction row; presences with no junction row keep their row (`unknown`). The migration
   logs four counts (junction rows without a presence before, rows inserted, the same count after,
   instances whose filled count changed) and fails if the "after" count is not equal to the orphan
   count of rows it was told to skip. On Postgres the backfill is one statement; SQLite (tests)
   may loop. A second run inserts nothing.
9. **Reconcile check, one-directional.** `reconcile_enrolment()` returns the shadow junction pairs
   `(player_id, lesson_instance_id)` that have no presence — an enrolment the code could not see.
   A presence with no shadow row is what option A is for and never needs one, so it is not a
   difference. The test suite asserts the list is empty after every write path, and it is run once
   on the staging copy of prod before phase 2 drops the junction (the phase-2 gate).

10. **A re-enrolment of someone who gave their spot up is a RETURN, not a no-op (PAD-316; rule number self-assigned, unconfirmed).** Rule 4's idempotence means an existing row is not *duplicated*; it never meant the row is untouched whatever it says. When `enrol()` finds a presence that is `status = 'absent'` and not validated, the player is coming back: the absence, its justification and the late-cancellation flag are cleared, their own open vacancy is closed and the instance reconciled (`notifications.invitations` rule 13). A row the coach has validated is left alone — that record is theirs to change on the attendance sheet.
   **The previous answer is void.** It recorded a "no" to a seat they no longer held, and nobody has asked them about this one, so the caller's `confirmed` stands rather than the stored flag: a coach's re-add leaves them `planned`, an engine fill arrives `coming`. Claiming they said yes would be the same over-reach as `confirmed` meaning *coming*.
   **The coach's own reversal is the same door.** Marking a student absent frees their spot and the engine opens a vacancy for it; marking them present again restores the count, so the reversal closes that vacancy too. Capacity alone will not: the vacancy names a player who is no longer absent, and that is what makes it stale, not the arithmetic — a class with spare room keeps offering a seat its owner has taken back.
   **A re-added student shows as `planned` until they answer of their own accord, and nothing asks them again.** `send_class_reminders` skips anyone whose reminder-attempt count has reached the coach's `reminderCount` (default 1), and a student who cancelled consumed their attempt before doing so; the pass reports no more due, so the scheduler does not re-arm for that occurrence. The coach therefore sees no answer and gets no signal to ask. Accepted deliberately (2026-09-12) rather than fixed here: it fails in the safe direction — before this rule the re-add did nothing at all and the seat was being offered to other people, whereas now they hold the seat and the class counts them, and what is missing is only the question. Asking them again means superseding the earlier attempts, which is a change to reminder behaviour that PAD-49 and PAD-94 spent effort making quiet; it has its own ticket.
   Both doors existed because "idempotent" was read as "returns untouched": before this, a coach re-adding a cancelled student changed nothing at all, and the app went on showing a seat the class did not count.

### Acceptance Criteria

#### A coach puts a cancelled student back (PAD-316)
- **Given** a student who confirmed and then cancelled, so the class does not count them and a vacancy is open for their spot
- **When** the coach re-adds them to that occurrence
- **Then** the class counts them again, their vacancy is closed, and their state is `planned` — on the list, not yet answered
- **And** re-enrolling a student who never left changes nothing at all, including their own `confirmed` answer

#### A coach reverses their own absent mark (PAD-316)
- **Given** a student the coach marked absent, freeing the spot and opening a vacancy
- **When** the coach marks them present instead
- **Then** the class counts them again and no vacancy is left offering their seat
- **And** marking a student absent still frees the spot as before

#### Materialisation writes one enrolment per roster player
- **Given** a recurring lesson with Alice and Bob on its roster
- **When** the occurrence for April 20 is materialised
- **Then** two `Presence` rows exist with `invited=True`, `enrolment_source="roster"`
- **And** `reconcile_enrolment()` is empty

#### A coach adds a player to one occurrence
- **Given** a materialised instance 10 with Alice and a coach who owns it
- **When** the coach edits the instance with `add_player_ids=[<Carol>]`
- **Then** Carol has a `Presence` on instance 10 with `enrolment_source="coach"`
- **And** instance 10's `effective_filled_spots` is 2

#### Capacity counts presences, and a decline frees the spot
- **Given** instance 10 with `max_players=2`, Alice and Carol enrolled
- **When** Carol declines her reminder
- **Then** `effective_filled_spots` is 1 and the join-request "is full" check says not full

#### The vacancy fill path enrols once
- **Given** an open vacancy on instance 10 and Dave invited
- **When** Dave answers yes
- **Then** Dave has exactly one `Presence` on instance 10 with `enrolment_source="fill"`, `confirmed=True`
- **And** answering yes again changes nothing

#### A walk-in on the attendance sheet becomes an enrolment
- **Given** instance 10 with Alice enrolled and the coach's roster containing Eve
- **When** the coach POSTs presences `[{playerId: <Eve>, status: "present"}]`
- **Then** Eve has a `Presence` with `enrolment_source="walk_in"`, `validated=True`, `status="present"`
- **And** `effective_filled_spots` counts her

#### Removing a player deletes the enrolment and retires the reminder bubble
- **Given** instance 10 with Alice enrolled and a reminder already sent to her
- **When** the coach edits the instance with `remove_player_ids=[<Alice>]`
- **Then** Alice has no `Presence` on instance 10 and the calendar shows one fewer participant
- **And** her pending reminder attempt is marked superseded so the bubble shows no live Yes/No

#### An answer from a removed player creates nothing (rule 7)
- **Given** Alice removed from instance 10 after her reminder was sent, still on the series roster
- **When** she answers the old reminder with `no`
- **Then** the response is `{"action": "not_enrolled"}` and the reminder attempt is marked responded
- **And** no `Presence` and no `Vacancy` exist for Alice on instance 10, and no invitation is sent

#### What the student sees after a not_enrolled answer (rule 7)
- **Given** Alice, removed from instance 10 after her reminder was sent, opens the old reminder bubble on web and on iOS
- **When** she taps No and the server answers `{"action": "not_enrolled"}`
- **Then** the bubble shows the settled "This class no longer includes you" state, never "not attending" / "absent", and offers no Yes/No or cancel
- **And** after a reload the same state renders from `msg_metadata.response === "not_enrolled"` on both shells

#### Backfill creates the missing presences and logs its counts
- **Given** a database at the parent revision with three junction rows lacking a presence, one of
  them pointing at a deleted player, and one presence with no junction row
- **When** the migration upgrades
- **Then** two presences are inserted (`invited=True`, `enrolment_source` `roster` or `coach`), the
  orphan junction row is skipped, the pre-existing presence keeps `enrolment_source="unknown"`
- **And** the log carries `junction_without_presence_before=3`, `presences_inserted=2`,
  `junction_without_presence_after=1` (the orphan), and a second upgrade inserts nothing

#### Shadow and presences agree after every path
- **Given** a materialisation, an edit-add, a vacancy fill, a walk-in and a removal
- **When** `reconcile_enrolment()` runs
- **Then** it returns an empty list

### Notes
- Phase 2 (a later batch): drop `player_in_lesson_instance`, remove the shadow writes, remove it
  from the player-claim and account-deletion table lists.
- Rule numbers assigned by Session H on 2026-09-11, unconfirmed by the coordinator.
