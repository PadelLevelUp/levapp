"""B-219: an edit that changes ONLY `openSpotsVisible` must be saved, on every edit path.

PAD-429 (b7bab9a34) moved the `.save()` that sat under `if visibility_touched:` into the new
`if auto_invites_touched:` block of `edit_class_service`. Both shells send only the fields that
changed (`edit-class-diff.ts`), so a visibility-only edit set the attribute and returned without
committing — the change was lost. Five paths carry the block: an instance's single occurrence and
its this-and-following, a lesson's single occurrence (existing instance, or created now) and its
this-and-following.

Each cell drops the session before reading (`db.session.remove()`): an uncommitted attribute is
still visible through the identity map, which would hide exactly this defect.
"""
import json
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _seed


def _recurring(app, ids):
    """Make the seeded lesson a weekly series with its seeded occurrence materialised."""
    from padel_app.models.lessons import Lesson

    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        lesson.is_recurring = True
        lesson.recurrence_rule = json.dumps({"frequency": "weekly", "daysOfWeek": [(lesson.start_datetime.weekday() + 1) % 7]})
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=8)).date()
        db.session.commit()
        return lesson.start_datetime


def _edit(app, event, scope, updates):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context():
        result, status = edit_class_service({"event": event, "scope": scope, "updates": updates})
        assert status in (200, 201), result
        db.session.remove()
        return result


def _fresh(app, model, pk, column):
    with app.app_context():
        db.session.remove()
        return getattr(db.session.get(model, pk), column)


def test_instance_single_occurrence_saves_visibility_alone(app):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
    _edit(app, event, "single", {"openSpotsVisible": False})
    assert _fresh(app, LessonInstance, ids["instance_id"], "open_spots_visible") is False


def test_instance_this_and_following_saves_visibility_alone(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    ids = _seed(app)
    _recurring(app, ids)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
    result = _edit(app, event, "future", {"openSpotsVisible": False})
    assert _fresh(app, Lesson, result["id"], "open_spots_visible") is False


def test_lesson_single_occurrence_with_an_instance_saves_visibility_alone(app):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    start = _recurring(app, ids)
    event = {"model": "Lesson", "originalId": ids["lesson_id"], "date": start.date().isoformat()}
    result = _edit(app, event, "single", {"openSpotsVisible": False})
    assert _fresh(app, LessonInstance, result["id"], "open_spots_visible") is False


def test_lesson_single_occurrence_materialised_now_saves_visibility_alone(app):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    start = _recurring(app, ids)
    later = (start + timedelta(weeks=1)).date().isoformat()  # a virtual occurrence
    event = {"model": "Lesson", "originalId": ids["lesson_id"], "date": later}
    result = _edit(app, event, "single", {"openSpotsVisible": False})
    assert _fresh(app, LessonInstance, result["id"], "open_spots_visible") is False


def test_lesson_this_and_following_saves_visibility_alone(app):
    from padel_app.models.lessons import Lesson

    ids = _seed(app)
    start = _recurring(app, ids)
    event = {"model": "Lesson", "originalId": ids["lesson_id"], "date": start.date().isoformat()}
    result = _edit(app, event, "future", {"openSpotsVisible": False})
    assert _fresh(app, Lesson, result["id"], "open_spots_visible") is False


def test_auto_invites_alone_and_eligibility_alone_are_saved_too(app):
    """The same shape for the two neighbours: each has its own save (controls)."""
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
    _edit(app, event, "single", {"autoInvites": False})
    assert _fresh(app, LessonInstance, ids["instance_id"], "auto_invites") is False
    _edit(app, event, "single", {"eligibilityRules": []})
    assert _fresh(app, LessonInstance, ids["instance_id"], "eligibility_rules") == []
