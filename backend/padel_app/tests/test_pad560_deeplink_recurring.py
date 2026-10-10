"""B-422 (PAD-560 follow-up; calendar.event-detail rule 15): the class payload says whether the
class recurs, so a screen opened by deep link — no calendar event in hand — still offers the
whole-series and period scopes. Before, `isRecurring` was on the calendar event only.
"""
from padel_app.tests.test_pad358_academy_classes import _add_class, _setup
from padel_app.tests.test_pad547_coach_adds_to_class_waiting_list import _instance, _quiet


def test_the_class_payload_says_whether_the_class_recurs(app, monkeypatch):
    from padel_app.serializers.lesson import serialize_class_instance

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _add_class(app, ids, days=3, title="Terça 18h", recurring=True)
    one_off = _add_class(app, ids, days=4, title="Sábado")
    with app.app_context():
        assert serialize_class_instance(_instance(series["instance_id"]))["isRecurring"] is True
        assert serialize_class_instance(_instance(one_off["instance_id"]))["isRecurring"] is False
        # The student's view carries it too: it is the class's shape, not coach data.
        assert serialize_class_instance(_instance(series["instance_id"]), viewer_player_id=ids["student_id"])["isRecurring"] is True
