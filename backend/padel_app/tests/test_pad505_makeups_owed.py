"""
PAD-505 — "Aula por repor / Tem reposição pendente" is a COUNT of classes owed, not a rate.

The coach reads the make-up round in the "understand invites" simulation (web and iOS). Each
student there carried "faltas justificadas 33%": the `justified_misses` tiebreaker's RATE
(justified absences / every class). The rule that put them in the round used a third measure:
justified absences > accepted invitations, all time (attendance.stats rule 3, an open question).

Owner decision (PAD-505, 2026-10-11): classes owed = justified absences - make-ups taken, never
below 0, over this coach. A make-up taken is ANY ACCEPTED INVITATION of this coach (a
`NotificationEvent` with `status == "confirmed"`), all time, even when the student then missed
the class. One number drives all three:
  - the `has_makeups is_true` rule (owed > 0);
  - the `justified_misses` tiebreaker (more owed ranks first);
  - the simulation's priority entry (`{"id": "justified_misses", "owed": N, "rate": r}`; `rate`
    stays for builds released before PAD-505).

Covered spec: attendance.stats rule 3; notifications.invite-simulation rule 11.
"""
import pytest
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed, utcnow_naive


def _past_class(ids, player_id, *, status, justification=None, source="roster", days_ago, validated=True):
    """One past class of this coach with the player's presence row on it; returns the instance id."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    start = utcnow_naive() - timedelta(days=days_ago)
    inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                          end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
    db.session.add(Presence(lesson_instance_id=inst.id, player_id=player_id, status=status,
                            justification=justification, validated=validated, enrolment_source=source))
    db.session.flush()
    return inst.id


def _accepted_invitation(ids, player_id, instance_id):
    from padel_app.models.notification_event import NotificationEvent

    db.session.add(NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=instance_id,
                                     player_id=player_id, type="auto", status="confirmed"))
    db.session.flush()


def _enrol(ids, player_id):
    from padel_app.models import Association_PlayerLesson

    db.session.add(Association_PlayerLesson(player_id=player_id, lesson_id=ids["lesson_id"]))
    db.session.flush()


def _engine_yes(ids, player_id, instance_id, *, closed_reason=None):
    from padel_app.models import EngineInvitation

    db.session.add(EngineInvitation(
        lesson_instance_id=instance_id, player_id=player_id, coach_id=ids["coach_id"], offer=[[None, None]],
        sent_at=utcnow_naive(), answer="yes", answered_by="student", closed_reason=closed_reason,
        closed_at=utcnow_naive() if closed_reason else None))
    db.session.flush()


def _justified(ids, student, days_ago):
    return _past_class(ids, student, status="absent", justification="justified", days_ago=days_ago)


def _owed(app, build):
    from padel_app.services.notification_service import _has_makeups, makeups_owed

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "student", ids["level_ids"]["5"])
        build(ids, student)
        db.session.commit()
        return makeups_owed(student, ids["coach_id"]), _has_makeups(student, ids["coach_id"])


# ── the count ────────────────────────────────────────────────────────────────

def _accepted(ids, s, days_ago, *, attended=True):
    """An accepted invitation to a class of this coach the student joined as a fill."""
    status, justification = ("present", None) if attended else ("absent", "unjustified")
    inst = _past_class(ids, s, status=status, justification=justification, source="fill", days_ago=days_ago)
    _accepted_invitation(ids, s, inst)


@pytest.mark.criterion("ATTENDANCE-STATS-1")
def test_owed_is_justified_absences_minus_accepted_invitations(app):
    def record(ids, s):
        for d in (40, 39, 38):
            _justified(ids, s, d)
        _accepted(ids, s, 20)

    assert _owed(app, record) == (2, True)


@pytest.mark.criterion("ATTENDANCE-STATS-2")
def test_an_accepted_invitation_the_student_then_missed_still_counts_as_a_makeup_taken(app):
    """Owner, PAD-505 Q2: the acceptance is the make-up, whatever happened at the class."""
    def record(ids, s):
        _justified(ids, s, 40)
        _accepted(ids, s, 20, attended=False)

    assert _owed(app, record) == (0, False)


def _guest_class(*, status="present", validated=True, justification=None):
    def record(ids, s):
        _justified(ids, s, 40)
        _past_class(ids, s, status=status, justification=justification, source="fill", days_ago=20,
                    validated=validated)
    return record


@pytest.mark.criterion("ATTENDANCE-STATS-3")
def test_a_guest_class_without_an_invitation_is_a_makeup_once_the_coach_validates_it(app):
    """[ATTENDANCE-STATS-3] History import D2: the student's own join request leaves no invitation,
    and the validated guest presence is the make-up."""
    assert _owed(app, _guest_class()) == (0, False)


@pytest.mark.criterion("ATTENDANCE-STATS-3")
def test_a_guest_class_not_yet_validated_is_not_a_makeup(app):
    """[ATTENDANCE-STATS-3] Not validated: still owed."""
    assert _owed(app, _guest_class(validated=False)) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-3")
def test_a_guest_class_the_student_missed_is_not_a_makeup(app):
    """[ATTENDANCE-STATS-3] Marked absent: still owed."""
    assert _owed(app, _guest_class(status="absent", justification="unjustified")) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-4")
def test_owed_never_goes_below_zero(app):
    def record(ids, s):
        _justified(ids, s, 40)
        for d in (20, 19, 18):
            _accepted(ids, s, d)

    assert _owed(app, record) == (0, False)


@pytest.mark.criterion("ATTENDANCE-STATS-5")
def test_a_justification_left_on_a_present_row_is_not_owed(app):
    """PAD-381: a corrected "absent, justified" kept its justification on a PRESENT row."""
    def record(ids, s):
        _past_class(ids, s, status="present", justification="justified", days_ago=40)

    assert _owed(app, record) == (0, False)


@pytest.mark.criterion("ATTENDANCE-STATS-6")
def test_another_coachs_invitation_does_not_pay_this_coachs_debt(app):
    """PAD-382 scoping: both sides of the count belong to this coach."""
    from padel_app.tests.test_pad382_attendance_readers_are_coach_scoped import _second_coach_with_rui

    def record(ids, s):
        _justified(ids, s, 40)
        other_coach, other_lesson = _second_coach_with_rui(ids, s)
        _accepted({"coach_id": other_coach, "lesson_id": other_lesson}, s, 20)

    assert _owed(app, record) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-9")
def test_a_validated_guest_presence_is_a_makeup_taken(app):
    """[ATTENDANCE-STATS-9] 2 justified absences, 1 validated guest class, no invitation: 1 owed."""
    def record(ids, s):
        _justified(ids, s, 40)
        _justified(ids, s, 39)
        _past_class(ids, s, status="present", source="fill", days_ago=20)

    assert _owed(app, record) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-10")
def test_attending_a_class_they_belong_to_is_not_a_makeup(app):
    """[ATTENDANCE-STATS-10] A validated present row on a class the student is enrolled in pays nothing."""
    def record(ids, s):
        _justified(ids, s, 40)
        _enrol(ids, s)
        _past_class(ids, s, status="present", days_ago=20)

    assert _owed(app, record) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-11")
def test_one_occurrence_pays_once_whichever_way_it_was_filled(app):
    """[ATTENDANCE-STATS-11] Accepted invitation (both stores) plus the guest presence it left: one make-up."""
    def record(ids, s):
        _justified(ids, s, 40)
        _justified(ids, s, 39)
        inst = _past_class(ids, s, status="present", source="fill", days_ago=20)
        _accepted_invitation(ids, s, inst)
        _engine_yes(ids, s, inst)

    assert _owed(app, record) == (1, True)


def _two_justified_one_missed_fill(store):
    def record(ids, s):
        _justified(ids, s, 40)
        _justified(ids, s, 39)
        inst = _past_class(ids, s, status="absent", justification="unjustified", source="fill", days_ago=20)
        store(ids, s, inst)
    return record


@pytest.mark.criterion("ATTENDANCE-STATS-12")
def test_the_old_engines_store_gives_one_owed(app):
    """[ATTENDANCE-STATS-12] Old engine: a confirmed NotificationEvent."""
    assert _owed(app, _two_justified_one_missed_fill(lambda ids, s, i: _accepted_invitation(ids, s, i))) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-12")
def test_the_new_engines_store_gives_the_same_number(app):
    """[ATTENDANCE-STATS-12] New engine: an EngineInvitation answered yes. One count feeds `has_makeups`,
    `justified_misses` and the engine's Student (engine_store._students reads makeups_owed_for)."""
    assert _owed(app, _two_justified_one_missed_fill(lambda ids, s, i: _engine_yes(ids, s, i))) == (1, True)


@pytest.mark.criterion("ATTENDANCE-STATS-13")
def test_a_new_engine_yes_is_a_makeup_taken_unless_its_class_did_not_happen(app):
    """[ATTENDANCE-STATS-13] Open and same_hour yeses count (even though the student missed the class);
    withdrawn and class_removed do not."""
    def record(ids, s):
        for d in (40, 39, 38, 37):
            _justified(ids, s, d)
        for days_ago, reason in ((20, None), (19, "withdrawn"), (18, "class_removed"), (17, "same_hour")):
            _engine_yes(ids, s, _past_class(ids, s, status="absent", justification="unjustified",
                                            source="fill", days_ago=days_ago), closed_reason=reason)

    assert _owed(app, record) == (2, True)


@pytest.mark.criterion("ATTENDANCE-STATS-14")
def test_a_former_regulars_past_present_rows_are_not_makeups(app):
    """[ATTENDANCE-STATS-14] Source roster, the student has since left the class (no roster place now)."""
    def record(ids, s):
        _justified(ids, s, 40)
        _justified(ids, s, 39)
        for d in (30, 29, 28):
            _past_class(ids, s, status="present", source="roster", days_ago=d)

    assert _owed(app, record) == (2, True)


def _unknown_and_import(ids, s):
    for d in (40, 39):
        _justified(ids, s, d)
    for d, source in ((30, "unknown"), (29, "import")):
        _past_class(ids, s, status="present", source=source, days_ago=d)


@pytest.mark.criterion("ATTENDANCE-STATS-15")
def test_fill_coach_and_walk_in_seats_are_guest_make_ups_even_after_the_student_joined_the_class(app):
    """[ATTENDANCE-STATS-15] Judged at the class's time, not by today's roster."""
    def record(ids, s):
        for d in (40, 39, 38, 37, 36, 35):
            _justified(ids, s, d)
        for d, source in ((30, "fill"), (29, "coach"), (28, "walk_in")):
            _past_class(ids, s, status="present", source=source, days_ago=d)
        _enrol(ids, s)

    assert _owed(app, record) == (3, True)


@pytest.mark.criterion("ATTENDANCE-STATS-15")
def test_unknown_and_import_seats_are_make_ups_only_off_the_roster(app):
    """[ATTENDANCE-STATS-15] Where the source cannot say, the student holds no place on the class."""
    assert _owed(app, _unknown_and_import) == (0, False)


@pytest.mark.criterion("ATTENDANCE-STATS-15")
def test_unknown_and_import_seats_of_a_regular_are_not_make_ups(app):
    """[ATTENDANCE-STATS-15] The in-app import writes `import` for regulars too."""
    def record(ids, s):
        _unknown_and_import(ids, s)
        _enrol(ids, s)

    assert _owed(app, record) == (2, True)


# ── the tiebreaker and the simulation ────────────────────────────────────────

@pytest.mark.criterion("ATTENDANCE-STATS-7")
def test_the_justified_misses_tiebreaker_ranks_by_classes_owed_and_the_simulation_shows_the_count(app):
    """Ana: 2 justified absences in 10 classes (20 %), 2 owed. Bruno: 1 justified absence in
    2 classes (50 %), 1 owed. By the rate Bruno went first; by classes owed Ana does, and the
    simulation's priority entry carries the integer the engine sorted on."""
    from unittest.mock import patch

    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.invite_simulation_service import simulate_vacancy

    ids = _seed(app)
    with app.app_context():
        ana = _add_student(ids["coach_id"], "ana", ids["level_ids"]["5"])
        bruno = _add_student(ids["coach_id"], "bruno", ids["level_ids"]["5"])
        departing = _add_student(ids["coach_id"], "departing", ids["level_ids"]["5"])
        _enrol(ids, ana)      # regulars: their present rows are not guest make-ups (rule 3, D2)
        _enrol(ids, bruno)
        _justified(ids, ana, 60)
        _justified(ids, ana, 59)
        for d in range(50, 42, -1):
            _past_class(ids, ana, status="present", days_ago=d)
        _justified(ids, bruno, 60)
        _past_class(ids, bruno, status="present", days_ago=50)
        from padel_app.models.presences import Presence
        db.session.add(Presence(player_id=departing, lesson_instance_id=ids["instance_id"],
                                invited=True, confirmed=False))
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        config.invitation_groups = [{"name": "Everyone", "rules": []}]
        config.priority_criteria = [{"id": "justified_misses", "label": "Justified Misses", "enabled": True}]
        config.eligibility_rules = []
        db.session.commit()

        instance = LessonInstance.query.get(ids["instance_id"])
        with patch("padel_app.services.notification_service.publish"), \
                patch("padel_app.services.notification_service.send_push_notification"):
            sim = simulate_vacancy(instance, ids["coach_id"], departing)
        candidates = [c for r in sim["rounds"] for c in r["candidates"]]
        # playerId is a string in the payload (notifications.invite-simulation rule 11).
        assert {str(ana), str(bruno)} <= {c["playerId"] for c in candidates}, candidates
        order = [c["playerId"] for c in candidates if c["playerId"] in (str(ana), str(bruno))]
        assert order == [str(ana), str(bruno)]
        by_player = {c["playerId"]: c["priority"] for c in candidates}
        assert [(e["id"], e["owed"]) for e in by_player[str(ana)]] == [("justified_misses", 2)]
        assert [(e["id"], e["owed"]) for e in by_player[str(bruno)]] == [("justified_misses", 1)]
        # Builds released before PAD-505 read `rate`; it stays so they never render "NaN%".
        assert by_player[str(ana)][0]["rate"] == 0.2
