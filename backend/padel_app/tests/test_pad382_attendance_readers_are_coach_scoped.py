"""
PAD-382 / bug B-143 — every reader of attendance used for invitations or eligibility
is scoped to the ASKING coach.

`eligibility.rules` rule 3 says absence rules read the student's record "with this
coach", and `_unjustified_absence_count` / `_has_makeups` do (through
`coach_instance_ids`, `classes.coach-assignment` rule 4). Others read the student's
rows with EVERY coach:

- `_students_with_recent_absences` and `_students_with_justified_absences`, which fill
  two default-enabled groups of the manual-invitation dialog (`GET /notify/groups`);
- the `justified_absences` eligibility attribute, through `_attendance_stats_for`.

So coach A's dialog and coach A's bar are shaped by what happened in coach B's classes:
a wrong answer, and a small disclosure of another coach's attendance record.

One student, Rui, is on both Ana's and Bruno's rosters. Each defect has its control:
the same absence recorded in ANA's class must still count for Ana.

Covered spec: eligibility.rules rule 3; attendance.stats.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _cp, _seed, utcnow_naive


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _second_coach_with_rui(ids, rui):
    """Bruno: another coach, his own lesson, Rui on his roster too. Returns (coach_id, lesson_id)."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson

    user = User(name="Bruno", username="bruno-382", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    bruno = Coach(user_id=user.id)
    db.session.add(bruno)
    db.session.flush()
    ana_lesson = Lesson.query.get(ids["lesson_id"])
    lesson = Lesson(title="Bruno class", start_datetime=ana_lesson.start_datetime,
                    end_datetime=ana_lesson.end_datetime, is_recurring=False, type="academy",
                    max_players=4, color="#000", status="active", club_id=ana_lesson.club_id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=bruno.id, lesson_id=lesson.id))
    db.session.add(Association_CoachPlayer(coach_id=bruno.id, player_id=rui))
    db.session.flush()
    return bruno.id, lesson.id


def _justified_absences(coach_id, lesson_id, player_id, how_many):
    """`how_many` past classes of this coach in which the player was absent, justified."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    for n in range(how_many):
        start = utcnow_naive() - timedelta(days=30 - n)
        inst = LessonInstance(lesson_id=lesson_id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=inst.id))
        db.session.add(Presence(lesson_instance_id=inst.id, player_id=player_id,
                                status="absent", justification="justified", validated=True))


# ── the manual-invitation dialog, at the route ───────────────────────────────

def _anas_groups_listing_rui(app, client, *, absent_with):
    ids = _seed(app)
    with app.app_context():
        rui = _add_student(ids["coach_id"], "rui", ids["level_ids"]["5"])
        bruno_id, bruno_lesson = _second_coach_with_rui(ids, rui)
        if absent_with == "bruno":
            _justified_absences(bruno_id, bruno_lesson, rui, 1)
        else:
            _justified_absences(ids["coach_id"], ids["lesson_id"], rui, 1)
        db.session.commit()
        token = create_access_token(identity=str(ids["coach_user_id"]))
    res = client.get(
        f"/api/app/notify/groups?model=LessonInstance&originalId={ids['instance_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.data
    groups = {g["id"]: {p["id"] for p in g["players"]} for g in res.get_json()}
    assert str(rui) in groups.get("all_students", set())
    return {gid for gid in ("recent_absences", "justified_absences") if str(rui) in groups.get(gid, set())}


def test_an_absence_in_another_coachs_class_does_not_shape_this_coachs_dialog(app, client):
    assert _anas_groups_listing_rui(app, client, absent_with="bruno") == set()


def test_control_an_absence_in_this_coachs_class_lists_the_student(app, client):
    assert _anas_groups_listing_rui(app, client, absent_with="ana") == {"recent_absences", "justified_absences"}


# ── the justified-absences bar ───────────────────────────────────────────────

BAR = [{"attribute": "justified_absences", "operation": "less_than_or_equal", "value": 1}]


def _anas_bar_admits_rui(app, *, absent_with):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import effective_eligibility, passes_eligibility

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        rui = _add_student(ids["coach_id"], "rui", ids["level_ids"]["5"])
        bruno_id, bruno_lesson = _second_coach_with_rui(ids, rui)
        if absent_with == "bruno":
            _justified_absences(bruno_id, bruno_lesson, rui, 2)
        else:
            _justified_absences(ids["coach_id"], ids["lesson_id"], rui, 2)
        db.session.commit()
        instance = LessonInstance.query.get(ids["instance_id"])
        rules = effective_eligibility(instance, ids["coach_id"])
        return passes_eligibility(_cp(ids["coach_id"], rui), instance, ids["coach_id"], rules)


def test_two_justified_absences_with_another_coach_do_not_fail_this_coachs_bar(app):
    assert _anas_bar_admits_rui(app, absent_with="bruno") is True


def test_control_two_justified_absences_with_this_coach_fail_the_bar(app):
    assert _anas_bar_admits_rui(app, absent_with="ana") is False


# ── the attendance-rate bar and the ranking stats, the same scope ────────────

def _stats_as_seen_by_ana(app, *, absent_with):
    """(attendance_rate, justified_miss_rate) Ana's engine computes for Rui, who has two
    justified absences with `absent_with` and nothing else."""
    from padel_app.services.notification_service import _attendance_stats

    ids = _seed(app)
    with app.app_context():
        rui = _add_student(ids["coach_id"], "rui", ids["level_ids"]["5"])
        bruno_id, bruno_lesson = _second_coach_with_rui(ids, rui)
        if absent_with == "bruno":
            _justified_absences(bruno_id, bruno_lesson, rui, 2)
        else:
            _justified_absences(ids["coach_id"], ids["lesson_id"], rui, 2)
        db.session.commit()
        return _attendance_stats(rui, ids["coach_id"])


def test_another_coachs_absences_leave_this_coachs_rates_at_zero(app):
    """No rows with Ana → (0.0, 0.0), the value a player with no record has always had;
    the ranking keys (`_rank_invited`, the approval-queue pick, the simulation) read
    this same function with the vacancy's coach."""
    assert _stats_as_seen_by_ana(app, absent_with="bruno") == (0.0, 0.0)


def test_control_this_coachs_absences_shape_this_coachs_rates(app):
    assert _stats_as_seen_by_ana(app, absent_with="ana") == (0.0, 1.0)
