"""PAD-513 (B-285): a court chosen for ONE occurrence of a recurring class must
never be answered with 200 and then dropped.

Decision-neutral on purpose: the save either refuses with the court named, or
the occurrence reads the court back (calendar card and class detail). Both the
materialised (LessonInstance) and the not-yet-materialised (Lesson + date)
single-scope paths are covered.
"""
from datetime import date

from padel_app.tests.test_courts import _class_payload, _jwt_secret, world  # noqa: F401 (fixtures)


OCCURRENCE = "2026-10-12"


def _series_with_court(client, world):
    c1, h = world["club1"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    court2 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 2"}, headers=h).get_json()["id"]
    res = client.post(
        "/api/app/add_class",
        json=_class_payload(
            name="Series",
            courtId=court1,
            isRecurring=True,
            recurrenceRule={"frequency": "weekly", "daysOfWeek": [1]},
            endDate="2026-12-21",
        ),
        headers=h,
    )
    assert res.status_code == 200, res.get_json()
    return res.get_json(), court1, court2


def _occurrence_court(client, lesson_id):
    from padel_app.models import LessonInstance
    from padel_app.serializers.calendar_event import serialize_calendar_event
    from padel_app.serializers.lesson import serialize_class_instance

    with client.application.app_context():
        instance = LessonInstance.query.filter_by(
            lesson_id=lesson_id, original_lesson_occurence_date=date.fromisoformat(OCCURRENCE)
        ).one()
        card = serialize_calendar_event(instance)["court"]
        detail = serialize_class_instance(instance)["courtId"]
        return (card or {}).get("id"), detail


def _assert_refused_or_kept(res, client, lesson_id, court2):
    body = res.get_json()
    if res.status_code == 400:
        assert "courtId" in (body.get("fields") or []), body
        return
    assert res.status_code == 200, body
    assert _occurrence_court(client, lesson_id) == (court2, court2)


def test_single_occurrence_court_on_a_materialised_instance(client, world):
    from padel_app.models import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    event, _court1, court2 = _series_with_court(client, world)
    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Series").one()
        lesson_id = lesson.id
        instance_id = get_or_materialize_instance(lesson, date.fromisoformat(OCCURRENCE)).id

    instance_event = {**event, "model": "LessonInstance", "originalId": instance_id, "date": OCCURRENCE}
    payload = {"event": instance_event, "scope": "single", "updates": {"courtId": court2}}
    res = client.post("/api/app/edit_class", json=payload, headers=world["a"])
    _assert_refused_or_kept(res, client, lesson_id, court2)


def test_single_occurrence_court_before_materialisation(client, world):
    from padel_app.models import Lesson

    event, _court1, court2 = _series_with_court(client, world)
    with client.application.app_context():
        lesson_id = Lesson.query.filter_by(title="Series").one().id

    payload = {"event": {**event, "date": OCCURRENCE}, "scope": "single", "updates": {"courtId": court2}}
    res = client.post("/api/app/edit_class", json=payload, headers=world["a"])
    if res.status_code == 400:
        assert "courtId" in (res.get_json().get("fields") or []), res.get_json()
        return
    assert res.status_code in (200, 201), res.get_json()
    assert _occurrence_court(client, lesson_id) == (court2, court2)


# ---------------------------------------------------------------------------
# clubs.courts rule 9 (PAD-513): the occurrence's own court, the PAD-275 way
# ---------------------------------------------------------------------------

def _materialise(client, title, day):
    from padel_app.models import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with client.application.app_context():
        lesson = Lesson.query.filter_by(title=title).one()
        return lesson.id, get_or_materialize_instance(lesson, date.fromisoformat(day)).id


def _edit_single(client, world, event, instance_id, day, court_id):
    instance_event = {**event, "model": "LessonInstance", "originalId": instance_id, "date": day}
    payload = {"event": instance_event, "scope": "single", "updates": {"courtId": court_id}}
    return client.post("/api/app/edit_class", json=payload, headers=world["a"])


def _override(client, instance_id):
    from padel_app.models import LessonInstance

    with client.application.app_context():
        return LessonInstance.query.get(instance_id).court_id


def _shown(client, instance_id):
    from padel_app.models import LessonInstance
    from padel_app.serializers.calendar_event import serialize_calendar_event

    with client.application.app_context():
        return (serialize_calendar_event(LessonInstance.query.get(instance_id))["court"] or {}).get("id")


def test_choosing_the_series_court_is_not_an_override(client, world):
    event, court1, court2 = _series_with_court(client, world)
    _lesson_id, instance_id = _materialise(client, "Series", OCCURRENCE)
    assert _edit_single(client, world, event, instance_id, OCCURRENCE, court2).status_code == 200
    assert _override(client, instance_id) == court2
    # Back to the series' court: the override is cleared, the occurrence inherits again.
    assert _edit_single(client, world, event, instance_id, OCCURRENCE, court1).status_code == 200
    assert _override(client, instance_id) is None
    assert _shown(client, instance_id) == court1


def test_no_court_for_one_occurrence_of_a_series_with_a_court_is_refused(client, world):
    event, court1, _court2 = _series_with_court(client, world)
    _lesson_id, instance_id = _materialise(client, "Series", OCCURRENCE)
    res = _edit_single(client, world, event, instance_id, OCCURRENCE, None)
    assert res.status_code == 400, res.get_json()
    assert res.get_json()["fields"] == ["courtId"]
    assert _shown(client, instance_id) == court1


def test_a_court_of_another_club_is_refused_for_one_occurrence(client, world):
    event, _court1, _court2 = _series_with_court(client, world)
    other = client.post(f"/api/app/club/{world['club2']}/courts", json={"name": "Outro"}, headers=world["b"]).get_json()["id"]
    _lesson_id, instance_id = _materialise(client, "Series", OCCURRENCE)
    res = _edit_single(client, world, event, instance_id, OCCURRENCE, other)
    assert res.status_code == 400
    assert res.get_json()["code"] == "court_not_in_club"
    assert _override(client, instance_id) is None


def test_a_future_court_edit_clears_overrides_from_the_boundary_on(client, world):
    c1, h = world["club1"], world["a"]
    event, court1, court2 = _series_with_court(client, world)
    court3 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 3"}, headers=h).get_json()["id"]
    _lesson_id, before = _materialise(client, "Series", "2026-10-12")
    _lesson_id, after = _materialise(client, "Series", "2026-10-26")
    for instance_id, day in ((before, "2026-10-12"), (after, "2026-10-26")):
        assert _edit_single(client, world, event, instance_id, day, court2).status_code == 200

    payload = {"event": {**event, "date": "2026-10-19"}, "scope": "future", "updates": {"courtId": court3}}
    res = client.post("/api/app/edit_class", json=payload, headers=h)
    assert res.status_code in (200, 201), res.get_json()

    assert _override(client, before) == court2 and _shown(client, before) == court2
    assert _override(client, after) is None and _shown(client, after) == court3


def test_a_future_edit_without_a_court_keeps_the_overrides(client, world):
    event, _court1, court2 = _series_with_court(client, world)
    _lesson_id, instance_id = _materialise(client, "Series", "2026-10-26")
    assert _edit_single(client, world, event, instance_id, "2026-10-26", court2).status_code == 200
    payload = {"event": {**event, "date": "2026-10-19"}, "scope": "future", "updates": {"name": "Series B"}}
    assert client.post("/api/app/edit_class", json=payload, headers=world["a"]).status_code in (200, 201)
    assert _override(client, instance_id) == court2


def test_deleting_the_occurrence_court_falls_back_to_the_series(client, world):
    event, court1, court2 = _series_with_court(client, world)
    _lesson_id, instance_id = _materialise(client, "Series", OCCURRENCE)
    assert _edit_single(client, world, event, instance_id, OCCURRENCE, court2).status_code == 200
    assert client.delete(f"/api/app/courts/{court2}", headers=world["a"]).status_code == 204
    assert _override(client, instance_id) is None
    assert _shown(client, instance_id) == court1


def test_the_class_detail_shows_the_occurrence_court(client, world):
    from padel_app.models import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    event, _court1, court2 = _series_with_court(client, world)
    _lesson_id, instance_id = _materialise(client, "Series", OCCURRENCE)
    assert _edit_single(client, world, event, instance_id, OCCURRENCE, court2).status_code == 200
    with client.application.app_context():
        detail = serialize_class_instance(LessonInstance.query.get(instance_id))
        assert (detail["courtId"], detail["courtName"]) == (court2, "Campo 2")


def test_migration_is_guarded():
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad513_occurrence_court*.py"))
    assert len(matches) == 1, matches
    src = matches[0].read_text()
    assert "lesson_instances" in src and "court_id" in src and "get_columns" in src
    assert 'ondelete="SET NULL"' in src


def test_a_one_off_class_edited_from_the_editor_sets_and_clears_its_court(client, world):
    """Both editors send scope "single" for a class that does not recur
    (ClassDetailSheet.tsx, class/[id].tsx): the court is the class's own."""
    from padel_app.models import Lesson
    from padel_app.serializers.calendar_event import serialize_calendar_event

    c1, h = world["club1"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    court2 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 2"}, headers=h).get_json()["id"]
    event = client.post("/api/app/add_class", json=_class_payload(name="One-off", courtId=court1), headers=h).get_json()

    def shown():
        with client.application.app_context():
            from padel_app.services.lesson_service import _instances_on_date

            lesson = Lesson.query.filter_by(title="One-off").one()
            existing = _instances_on_date(lesson, date.fromisoformat(event["date"]))
            return (serialize_calendar_event(existing[0] if existing else lesson)["court"] or {}).get("id")

    for court_id in (court2, None):
        payload = {"event": event, "scope": "single", "updates": {"courtId": court_id}}
        res = client.post("/api/app/edit_class", json=payload, headers=h)
        assert res.status_code in (200, 201), res.get_json()
        assert shown() == court_id
