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
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed, utcnow_naive


def _past_class(ids, player_id, *, status, justification=None, source="roster", days_ago):
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
                            justification=justification, validated=True, enrolment_source=source))
    db.session.flush()
    return inst.id


def _accepted_invitation(ids, player_id, instance_id):
    from padel_app.models.notification_event import NotificationEvent

    db.session.add(NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=instance_id,
                                     player_id=player_id, type="auto", status="confirmed"))
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


def test_owed_is_justified_absences_minus_accepted_invitations(app):
    def record(ids, s):
        for d in (40, 39, 38):
            _justified(ids, s, d)
        _accepted(ids, s, 20)

    assert _owed(app, record) == (2, True)


def test_an_accepted_invitation_the_student_then_missed_still_counts_as_a_makeup_taken(app):
    """Owner, PAD-505 Q2: the acceptance is the make-up, whatever happened at the class."""
    def record(ids, s):
        _justified(ids, s, 40)
        _accepted(ids, s, 20, attended=False)

    assert _owed(app, record) == (0, False)


def test_a_class_attended_without_an_accepted_invitation_is_not_a_makeup_taken(app):
    """A fill reached through the student's own join request leaves no invitation."""
    def record(ids, s):
        _justified(ids, s, 40)
        _past_class(ids, s, status="present", source="fill", days_ago=20)

    assert _owed(app, record) == (1, True)


def test_owed_never_goes_below_zero(app):
    def record(ids, s):
        _justified(ids, s, 40)
        for d in (20, 19, 18):
            _accepted(ids, s, d)

    assert _owed(app, record) == (0, False)


def test_a_justification_left_on_a_present_row_is_not_owed(app):
    """PAD-381: a corrected "absent, justified" kept its justification on a PRESENT row."""
    def record(ids, s):
        _past_class(ids, s, status="present", justification="justified", days_ago=40)

    assert _owed(app, record) == (0, False)


def test_another_coachs_invitation_does_not_pay_this_coachs_debt(app):
    """PAD-382 scoping: both sides of the count belong to this coach."""
    from padel_app.tests.test_pad382_attendance_readers_are_coach_scoped import _second_coach_with_rui

    def record(ids, s):
        _justified(ids, s, 40)
        other_coach, other_lesson = _second_coach_with_rui(ids, s)
        _accepted({"coach_id": other_coach, "lesson_id": other_lesson}, s, 20)

    assert _owed(app, record) == (1, True)


# ── the tiebreaker and the simulation ────────────────────────────────────────

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
