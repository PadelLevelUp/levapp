"""PAD-429 — a private class defaults to no automatic invitations and hidden open spots.

notifications.toggle-class rules 5–7: a per-class tri-state `auto_invites` (instance → lesson →
the lesson's type: private off, academy on), read only by the automatic engine
(`trigger_invitations` and the sweep). Reminders, manual invitations and waiting-list offers are
untouched.

eligibility.open-spot-visibility rule 3a: a private lesson with no lesson/instance override
resolves to hidden (source `type`) before the coach standard. Rule 12's `class-type-defaults`
capability: a client that doesn't declare it is sent `coach` for that source.

Both defaults are read-time resolution from `Lesson.type` (coordinator, 2026-09-25, option a):
nothing is written, so existing private classes get them and explicit overrides are kept.

    pytest padel_app/tests/test_pad429_private_class_defaults.py -v
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import (
    PATCHES,
    _create_coach,
    _create_coach_player,
    _create_instance,
    _create_level,
    _create_player,
    _create_user,
    _seed_notification_config,
)
from padel_app.tests.test_pad128_eligibility import _seed
from padel_app.tests.test_pad130_open_spots import _config, _fill, _open_spots, _student


# ---------------------------------------------------------------------------
# The automatic engine (notifications.toggle-class rules 5–7)
# ---------------------------------------------------------------------------

def _class_with_a_candidate(app, *, lesson_type, name):
    """A coach with the engine on, a class of `lesson_type` holding 1 of 2 players, and one
    more student on the roster at the class's level who is not enrolled: the candidate."""
    with app.app_context():
        coach = _create_coach(_create_user("Coach", f"{name}-coach"))
        level = _create_level(coach)
        enrolled = _create_player(_create_user("Enrolled", f"{name}-enrolled"))
        candidate = _create_player(_create_user("Candidate", f"{name}-candidate"))
        _create_coach_player(coach, enrolled, level)
        _create_coach_player(coach, candidate, level)
        instance = _create_instance(coach, level, enrolled_players=[enrolled], max_players=2)
        instance.lesson.type = lesson_type
        db.session.commit()
        _seed_notification_config(coach.id, auto_notify=True)
        return {"coach_id": coach.id, "instance_id": instance.id, "lesson_id": instance.lesson_id,
                "candidate_id": candidate.id, "enrolled_id": enrolled.id}


def _trigger(app, ids, **kw):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        return len(trigger_invitations(LessonInstance.query.get(ids["instance_id"]), ids["coach_id"], **kw))


def _invites_sent(app, ids):
    from padel_app.models.notification_event import NotificationEvent

    with app.app_context():
        return NotificationEvent.query.filter_by(lesson_instance_id=ids["instance_id"]).count()


def _payload(app, ids):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    with app.test_request_context(headers={"X-LevApp-Capabilities": "open-spots, class-type-defaults"}):
        return serialize_class_instance(LessonInstance.query.get(ids["instance_id"]))


def _set(app, model, obj_id, **fields):
    with app.app_context():
        obj = model.query.get(obj_id)
        for k, v in fields.items():
            setattr(obj, k, v)
        db.session.commit()


def test_a_private_class_is_not_filled_automatically(app):
    ids = _class_with_a_candidate(app, lesson_type="private", name="priv")

    assert _trigger(app, ids) == 0
    assert _invites_sent(app, ids) == 0
    payload = _payload(app, ids)
    assert payload["autoInvites"] is None
    assert payload["effectiveAutoInvites"] is False
    assert payload["autoInvitesSource"] == "type"


def test_a_private_class_still_reminds_its_own_students(app):
    """Rule 6: reminders are untouched. Same class, same reminder result as an academy class."""
    from padel_app.services.notification_service import send_class_reminders

    results = {}
    for lesson_type in ("private", "academy"):
        ids = _class_with_a_candidate(app, lesson_type=lesson_type, name=f"rem-{lesson_type}")
        with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
            results[lesson_type] = send_class_reminders(ids["instance_id"], now=datetime.utcnow() + timedelta(hours=30))
    assert results["private"]["sent"] == results["academy"]["sent"] >= 1


def test_a_coach_turns_automatic_invitations_on_for_a_private_class(app):
    from padel_app.models.lessons import Lesson

    ids = _class_with_a_candidate(app, lesson_type="private", name="priv-on")
    _set(app, Lesson, ids["lesson_id"], auto_invites=True)

    assert _trigger(app, ids) >= 1
    payload = _payload(app, ids)
    assert payload["effectiveAutoInvites"] is True
    assert payload["autoInvitesSource"] == "lesson"


def test_an_academy_class_is_filled_automatically_by_default(app):
    ids = _class_with_a_candidate(app, lesson_type="academy", name="acad")

    assert _trigger(app, ids) >= 1
    payload = _payload(app, ids)
    assert payload["effectiveAutoInvites"] is True
    assert payload["autoInvitesSource"] == "type"


def test_an_instance_override_wins_over_the_lesson(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    ids = _class_with_a_candidate(app, lesson_type="academy", name="inst-off")
    _set(app, Lesson, ids["lesson_id"], auto_invites=True)
    _set(app, LessonInstance, ids["instance_id"], auto_invites=False)

    assert _trigger(app, ids) == 0
    payload = _payload(app, ids)
    assert payload["autoInvites"] is False
    assert payload["autoInvitesSource"] == "instance"


def test_turning_automatic_invitations_off_mid_fill_stops_the_rounds(app):
    """Rule 6: the sweep holds the class's open vacancies once auto-invites resolve off."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import process_invitation_batches

    ids = _class_with_a_candidate(app, lesson_type="academy", name="midfill")
    with app.app_context():
        # a second candidate, so a later round has someone left to invite
        extra = _create_player(_create_user("Extra", "midfill-extra"))
        from padel_app.models.coaches import Coach
        coach = Coach.query.get(ids["coach_id"])
        lesson_level = LessonInstance.query.get(ids["instance_id"]).level_id
        from padel_app.models.coach_levels import CoachLevel
        _create_coach_player(coach, extra, CoachLevel.query.get(lesson_level))
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        # one student per batch, and a 30-minute wait before the next one (PAD-279 columns)
        cfg.max_simultaneous_enabled, cfg.max_simultaneous_value = True, 1
        cfg.max_inactive_time_enabled, cfg.max_inactive_time_value = True, 30
        db.session.commit()

    assert _trigger(app, ids) >= 1
    sent_before = _invites_sent(app, ids)
    _set(app, LessonInstance, ids["instance_id"], auto_invites=False)

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        process_invitation_batches(now=datetime.utcnow() + timedelta(hours=2))
    assert _invites_sent(app, ids) == sent_before


def test_manual_invitations_ignore_the_setting(app):
    from padel_app.services.notification_service import send_manual_notifications

    ids = _class_with_a_candidate(app, lesson_type="private", name="manual")
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        sent = send_manual_notifications(ids["instance_id"], [ids["candidate_id"]], ids["coach_id"])
    assert len(sent) == 1


# ---------------------------------------------------------------------------
# Open-spot visibility (eligibility.open-spot-visibility rule 3a, rule 12)
# ---------------------------------------------------------------------------

def _private_seed(app):
    from padel_app.models.lessons import Lesson

    ids = _seed(app, eligibility_rules=None)
    _set(app, Lesson, ids["lesson_id"], type="private")
    _config(app, ids, open_spots_visible=True)
    _fill(app, ids, 2)  # 2 of 4: room
    return ids


def test_a_private_class_is_hidden_unless_the_coach_makes_it_visible(app):
    from padel_app.models.lessons import Lesson

    ids = _private_seed(app)
    bruno = _student(app, ids, "bruno", "5")

    assert _open_spots(app, bruno) == []
    payload = _payload(app, ids)
    assert payload["effectiveOpenSpotsVisible"] is False
    assert payload["openSpotsSource"] == "type"

    _set(app, Lesson, ids["lesson_id"], open_spots_visible=True)
    assert len(_open_spots(app, bruno)) == 1


def test_an_academy_class_still_follows_the_coach_standard(app):
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    payload = _payload(app, ids)
    assert payload["effectiveOpenSpotsVisible"] is True
    assert payload["openSpotsSource"] == "coach"


def test_a_client_without_class_type_defaults_never_sees_the_type_source(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    ids = _private_seed(app)
    with app.test_request_context(headers={"X-LevApp-Capabilities": "open-spots"}):
        payload = serialize_class_instance(LessonInstance.query.get(ids["instance_id"]))
    assert payload["effectiveOpenSpotsVisible"] is False
    assert payload["openSpotsSource"] == "coach"


# ---------------------------------------------------------------------------
# The wire (toggle-class rule 7) and the invite explanation
# ---------------------------------------------------------------------------

def test_edit_single_sets_auto_invites_and_null_returns_it_to_the_type_default(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service

    ids = _class_with_a_candidate(app, lesson_type="private", name="edit")
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
        _, status = edit_class_service({"event": event, "scope": "single", "updates": {"autoInvites": True}})
        assert status == 200
        assert db.session.get(LessonInstance, inst.id).auto_invites is True
        # untouched payloads leave it alone …
        edit_class_service({"event": event, "scope": "single", "updates": {"name": "Renamed"}})
        assert db.session.get(LessonInstance, inst.id).auto_invites is True
        # … and null returns it to the lesson/type default
        edit_class_service({"event": event, "scope": "single", "updates": {"autoInvites": None}})
        assert db.session.get(LessonInstance, inst.id).auto_invites is None
    assert _payload(app, ids)["autoInvitesSource"] == "type"


def test_the_explanation_names_automatic_invitations_off(app):
    """The invite explanation stays honest: a new gate for a declaring client, folded into the
    class-notifications gate for a build that predates the code."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.invite_simulation_service import simulate_vacancy

    ids = _class_with_a_candidate(app, lesson_type="private", name="explain")

    def gates(caps):
        with app.test_request_context(headers={"X-LevApp-Capabilities": caps}):
            inst = LessonInstance.query.get(ids["instance_id"])
            return {g["code"]: g["blocked"] for g in simulate_vacancy(inst, ids["coach_id"], None)["gates"]}

    new = gates("open-spots, evaluations, class-type-defaults")
    assert new["class_auto_invites_off"] is True
    assert new["class_notifications_disabled"] is False
    old = gates("open-spots, evaluations")
    assert "class_auto_invites_off" not in old
    assert old["class_notifications_disabled"] is True


def test_creating_a_private_class_stores_nothing_unless_the_coach_chose(app):
    """Rule 7: create takes `autoInvites`; absent leaves the tier NULL (the type default)."""
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import add_class_service

    ids = _class_with_a_candidate(app, lesson_type="academy", name="create")
    base = {"name": "One-off", "classType": "private", "maxPlayers": 1, "startTime": "10:00",
            "endTime": "11:00", "isRecurring": False, "playerIds": []}
    with app.app_context():
        coach, club = db.session.get(Coach, ids["coach_id"]), Club.query.first()
        plain = add_class_service({**base, "date": "2027-03-01"}, coach, club)
        chosen = add_class_service({**base, "date": "2027-03-02", "autoInvites": True}, coach, club)
        assert plain.auto_invites is None
        assert chosen.auto_invites is True
