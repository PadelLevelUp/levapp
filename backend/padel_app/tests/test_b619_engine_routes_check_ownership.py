"""B-619 — the engine routes that address a class by `{model, originalId, date}` check the coach owns
it, before anything is sent or materialised.

notifications.class-reminders-manual rule 4, eligibility.enforcement rule 7e: `/send_reminders` pushed
reminders to another coach's class by sequential id, and `/eligibility_check` materialised a
LessonInstance on another coach's virtual occurrence before answering. `/manual` and
`/class_waiting_list` (403) and the invite simulation (404) checked, but only after resolving, so
they materialised too. All now go through one owned resolver: a foreign class is refused and no
row is written.

    pytest padel_app/tests/test_b619_engine_routes_check_ownership.py -v
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad258_write_ownership import PATCHES, _h, _jwt_secret, world  # noqa: F401


@pytest.fixture
def virtual(app, world):
    """A second one-off class of Ana's with no occurrence row yet: addressed as a Lesson + date."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lessons import Lesson

    with app.app_context():
        club_id = Lesson.query.get(world["lesson"]).club_id
        start = datetime.utcnow().replace(microsecond=0) + timedelta(days=3)
        lesson = Lesson(title="Ana virtual", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                        club_id=club_id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=_coach_id(world["ana"]), lesson_id=lesson.id))
        db.session.commit()
        return {"lesson": lesson.id, "date": start.date().isoformat()}


def _coach_id(user_id):
    from padel_app.models import User

    return User.query.get(user_id).coach.id


def _instances_of(app, lesson_id):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        return LessonInstance.query.filter_by(lesson_id=lesson_id).count()


def _post(app, client, path, user_id, body):
    with patch(PATCHES[0]), patch(PATCHES[1]), patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        return client.post(f"/api/app/notify/{path}", json=body, headers=_h(app, user_id))


def _reminder_count(app, instance_id):
    from padel_app.models.reminder_attempts import ReminderAttempt

    with app.app_context():
        return ReminderAttempt.query.filter_by(lesson_instance_id=instance_id).count()


# ── /send_reminders ─────────────────────────────────────────────────────────

def test_another_coach_cannot_send_reminders_for_a_class(app, client, world):
    before = _reminder_count(app, world["instance"])
    res = _post(app, client, "send_reminders", world["bruno"],
                {"model": "LessonInstance", "originalId": world["instance"]})
    assert res.status_code == 403
    assert _reminder_count(app, world["instance"]) == before


def test_the_owner_still_sends_reminders(app, client, world):
    res = _post(app, client, "send_reminders", world["ana"],
                {"model": "LessonInstance", "originalId": world["instance"]})
    assert res.status_code == 200, res.get_json()


def test_another_coach_cannot_materialise_an_occurrence_through_send_reminders(app, client, world, virtual):
    res = _post(app, client, "send_reminders", world["bruno"],
                {"model": "Lesson", "originalId": virtual["lesson"], "date": virtual["date"]})
    assert res.status_code == 403
    assert _instances_of(app, virtual["lesson"]) == 0


# ── /eligibility_check ──────────────────────────────────────────────────────

def test_another_coach_cannot_check_eligibility_on_a_class(app, client, world):
    res = _post(app, client, "eligibility_check", world["bruno"],
                {"model": "LessonInstance", "originalId": world["instance"], "playerIds": [world["sara"]]})
    assert res.status_code == 403


def test_the_owner_still_checks_eligibility(app, client, world):
    res = _post(app, client, "eligibility_check", world["ana"],
                {"model": "LessonInstance", "originalId": world["instance"], "playerIds": [world["sara"]]})
    assert res.status_code == 200, res.get_json()
    assert "ineligible" in res.get_json()


def test_another_coach_cannot_materialise_an_occurrence_through_eligibility_check(app, client, world, virtual):
    res = _post(app, client, "eligibility_check", world["bruno"],
                {"model": "Lesson", "originalId": virtual["lesson"], "date": virtual["date"], "playerIds": []})
    assert res.status_code == 403
    assert _instances_of(app, virtual["lesson"]) == 0


def test_the_owner_still_materialises_through_eligibility_check(app, client, world, virtual):
    """Control: the owner's Lesson + date still resolves (and materialises) as before (R-001)."""
    res = _post(app, client, "eligibility_check", world["ana"],
                {"model": "Lesson", "originalId": virtual["lesson"], "date": virtual["date"], "playerIds": []})
    assert res.status_code == 200, res.get_json()
    assert _instances_of(app, virtual["lesson"]) == 1


# ── the sweep: routes that checked, but after materialising ─────────────────

@pytest.mark.parametrize("path,extra,status", [
    ("manual", {"playerIds": ["sara"]}, 403),
    ("class_waiting_list", {"playerId": "sara"}, 403),
    # invite-simulation keeps its 404 for a foreign class (PAD-196).
    ("invite_simulation", {"departingPlayerId": "rui"}, 404),
])
def test_a_foreign_class_is_refused_before_it_is_materialised(app, client, world, virtual, path, extra, status):
    body = {"model": "Lesson", "originalId": virtual["lesson"], "date": virtual["date"]}
    for key, value in extra.items():
        body[key] = [world[v] for v in value] if isinstance(value, list) else world[value]
    res = _post(app, client, path, world["bruno"], body)
    assert res.status_code == status
    assert _instances_of(app, virtual["lesson"]) == 0
