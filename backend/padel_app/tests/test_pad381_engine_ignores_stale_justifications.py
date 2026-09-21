"""
PAD-381 / bug B-152, second half — the invitation engine must not act on a
justification left behind on a PRESENT row.

`_unjustified_absence_count` and `_has_makeups` counted presence rows by
`justification` alone, never checking `status`. Until PAD-381 a coach who corrected
"absent, justified" (or "absent, unjustified") to "present" left the justification on
the row, so those rows exist in production, and the engine went on treating them as
absences:

- a stale UNJUSTIFIED row counted toward the coach's unjustified-absence bar, so a
  student could be shut out of invitations for an absence the coach had corrected;
- a stale JUSTIFIED row counted as a justified absence, so a student was admitted to
  the "has make-ups" group — invited ahead of others — while owed nothing.

These tests assert the engine's DECISION (does the bar admit the student; is the
student in the make-up wave), not the helper's return value. Each defect has its
control: a REAL absence must still count, before and after.

Covered spec: eligibility.rules (absence rules); attendance.validation rule 21.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _cp, _seed, utcnow_naive


def _past_presence(ids, player_id, *, status, justification, days_ago):
    """One presence row for the player on its own past class of this coach."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    start = utcnow_naive() - timedelta(days=days_ago)
    inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                          end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
    db.session.add(Presence(lesson_instance_id=inst.id, player_id=player_id,
                            status=status, justification=justification, validated=True))


# ── the unjustified-absence bar ──────────────────────────────────────────────

BAR = [{"attribute": "unjustified_absences", "operation": "less_than_or_equal", "value": 2}]


def _admitted(app, build):
    """Seed a coach with the ≤ 2 bar, let `build(ids, player_id)` write the student's
    record, and answer whether the bar admits them."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import effective_eligibility, passes_eligibility

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        student = _add_student(ids["coach_id"], "student", ids["level_ids"]["5"])
        build(ids, student)
        db.session.commit()
        instance = LessonInstance.query.get(ids["instance_id"])
        rules = effective_eligibility(instance, ids["coach_id"])
        return passes_eligibility(_cp(ids["coach_id"], student), instance, ids["coach_id"], rules)


def test_a_corrected_absence_does_not_shut_a_student_out_of_invitations(app):
    """Two real unjustified absences are inside the bar; a third row the coach corrected
    to PRESENT pushed the count to 3 and the student stopped being invited."""
    def record(ids, student):
        _past_presence(ids, student, status="absent", justification="unjustified", days_ago=30)
        _past_presence(ids, student, status="absent", justification="unjustified", days_ago=29)
        _past_presence(ids, student, status="present", justification="unjustified", days_ago=28)  # stale

    assert _admitted(app, record) is True


def test_control_three_real_unjustified_absences_still_shut_a_student_out(app):
    def record(ids, student):
        for days_ago in (30, 29, 28):
            _past_presence(ids, student, status="absent", justification="unjustified", days_ago=days_ago)

    assert _admitted(app, record) is False


# ── the make-up wave ─────────────────────────────────────────────────────────

MAKEUP_GROUPS = [
    {"name": "Make-ups first", "rules": [{"attribute": "has_makeups", "operation": "is_true"}]},
    {"name": "Everyone", "rules": []},
]


def _in_makeup_wave(app, build):
    """Seed a coach whose first invitation group is "has make-ups", let `build` write
    the student's record, open a vacancy, and answer whether the engine puts the
    student in that first wave."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _get_eligible_students_for_group

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "student", ids["level_ids"]["5"])
        build(ids, student)
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        config.invitation_groups = MAKEUP_GROUPS
        db.session.add(Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"],
                               status="open", level_id=ids["level_ids"]["5"]))
        db.session.commit()

        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        instance = LessonInstance.query.get(ids["instance_id"])
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).first()
        wave = _get_eligible_students_for_group(vacancy, instance, ids["coach_id"], config, 1)
        everyone = _get_eligible_students_for_group(vacancy, instance, ids["coach_id"], config, 2)
        # The student is always invitable in the open wave — what changes is the priority.
        assert student in {cp.player_id for cp in everyone}
        return student in {cp.player_id for cp in wave}


def test_a_corrected_absence_does_not_put_a_student_in_the_makeup_wave(app):
    """"Absent, justified" corrected to PRESENT: the student attended and is owed nothing,
    yet the leftover justification admitted them to the make-ups-first wave."""
    def record(ids, student):
        _past_presence(ids, student, status="present", justification="justified", days_ago=30)  # stale

    assert _in_makeup_wave(app, record) is False


def test_control_a_real_justified_absence_still_puts_a_student_in_the_makeup_wave(app):
    def record(ids, student):
        _past_presence(ids, student, status="absent", justification="justified", days_ago=30)

    assert _in_makeup_wave(app, record) is True


# ── the manual-invitation dialog's "Justified absences" group ────────────────
# `GET /notify/groups` fills the coach's manual-invite dialog on web and iOS; the
# group is enabled by default. It read `justification` alone, like the two above.

def _in_manual_justified_group(app, build):
    from padel_app.services.notification_service import get_notification_groups

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "student", ids["level_ids"]["5"])
        build(ids, student)
        db.session.commit()
        groups = get_notification_groups("LessonInstance", ids["instance_id"], None, ids["coach_id"])
        by_id = {g["id"]: {p["id"] for p in g["players"]} for g in groups}
        # The student is always offered under "All students" — what changes is this one group.
        assert str(student) in by_id.get("all_students", set())
        return str(student) in by_id.get("justified_absences", set())


def test_a_corrected_absence_does_not_list_a_student_under_justified_absences(app):
    def record(ids, student):
        _past_presence(ids, student, status="present", justification="justified", days_ago=30)  # stale

    assert _in_manual_justified_group(app, record) is False


def test_control_a_real_justified_absence_still_lists_the_student(app):
    def record(ids, student):
        _past_presence(ids, student, status="absent", justification="justified", days_ago=30)

    assert _in_manual_justified_group(app, record) is True


# ── the second writer: the attendance import ─────────────────────────────────
# Service level on purpose: the route is the multi-sheet onboarding import; the rule
# under test is two lines of `bulk_create_presences`, which that route calls as is.

def _imported(app, row_status, row_justification):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.presences import Presence
    from padel_app.services.import_service import bulk_create_presences

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "student", ids["level_ids"]["5"])
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=ids["lesson_id"]))
        db.session.commit()
        lesson = Lesson.query.get(ids["lesson_id"])
        rows = [{"lesson_title": lesson.title, "date": lesson.start_datetime.date().isoformat(),
                 "player_name": "student", "status": row_status, "justification": row_justification}]
        bulk_create_presences(rows, Coach.query.get(ids["coach_id"]))
        row = Presence.query.filter_by(player_id=student).one()
        return row.status, row.justification


def test_an_imported_present_row_carries_no_justification(app):
    assert _imported(app, "present", "justified") == ("present", None)


def test_control_an_imported_absence_keeps_its_justification(app):
    assert _imported(app, "absent", "justified") == ("absent", "justified")

