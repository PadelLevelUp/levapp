"""classes.detail-visibility rule 6 (PAD-925): the class payload carries `classType`, so the detail's
Particular / Academia chip shows for a class opened from the dashboard, from a message or from a push.
Those three open the screen by id alone (no calendar event to read the type from), and all three read
`POST /api/app/class_instance`; the payload is scoped exactly as rule 5 says, so the field is too."""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad257_class_read_scope import _h, _jwt_secret, world  # noqa: F401


def _set_type(app, world, kind):
    from padel_app.models.lessons import Lesson

    with app.app_context():
        db.session.get(Lesson, world["lesson"]).type = kind
        db.session.commit()


def _payload(app, client, world, who, model):
    key = "instance" if model == "lessoninstance" else "lesson"
    return client.post(f"/api/app/class_instance?model={model}&id={world[key]}", headers=_h(app, world[who]))


@pytest.mark.parametrize("model", ["lessoninstance", "lesson"])
@pytest.mark.parametrize("kind", ["private", "academy"])
@pytest.mark.parametrize("who", ["ana", "carla", "rui"])
@pytest.mark.criterion("CLASSES-DETAIL-VISIBILITY-6")
def test_the_class_payload_names_the_class_type(app, client, world, who, kind, model):
    """The owner coach and a club colleague read it for an occurrence and a series; an enrolled student, for an occurrence."""
    if who == "rui" and model == "lesson":
        pytest.skip("an enrolled student reads an occurrence, never the series (rule 5)")
    _set_type(app, world, kind)
    res = _payload(app, client, world, who, model)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["classType"] == kind


@pytest.mark.parametrize("model", ["lessoninstance", "lesson"])
@pytest.mark.parametrize("who", ["bruno", "sara"])
@pytest.mark.criterion("CLASSES-DETAIL-VISIBILITY-6")
def test_the_type_follows_the_payloads_read_scope(app, client, world, who, model):
    """Another club's coach and an unenrolled student get 403 and no payload, so no `classType` either (rule 5)."""
    _set_type(app, world, "private")
    res = _payload(app, client, world, who, model)
    assert res.status_code == 403
    assert "classType" not in res.get_data(as_text=True)
