"""PAD-551 — classes.instance-enrollment rule 13; notifications.invitations rules 2–2d.

A coach sets a regular's side for ONE occurrence (`presences.side`, left/right, null = the usual
side on the coach–player link). That side is what the class's balancing counts, the side a freed
spot starts from when the player cancels, and a change re-counts the class's open spots as a "yes"
does (rule 2d), withdrawing round-1 invitations a flip leaves on the wrong side.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol
from padel_app.tests.test_pad581_side_rebalance import _bubble, _event, _invite, _patch_io, _setup


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _class(tag, sides):
    coach = _create_coach(f"p551{tag}")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, f"p551{tag}", instance_level=level, max_players=len(sides) + 1)
    cps = [_enrol(coach, level, instance, f"p551{tag}-{i}", side) for i, side in enumerate(sides)]
    db.session.commit()
    return coach, instance, cps


def _put(client, app, user_id, instance_id, player_id, side):
    return client.put(
        f"/api/app/lesson_instance/{instance_id}/presences/{player_id}/side",
        json={"side": side},
        headers=_auth(app, user_id),
    )


def _rows(client, app, user_id, instance_id):
    res = client.get(f"/api/app/lesson_instance/{instance_id}/presences", headers=_auth(app, user_id))
    assert res.status_code == 200, res.get_json()
    return {r["playerId"]: r for r in res.get_json()}


def test_the_coach_sets_and_clears_a_players_side_for_one_occurrence(app, client, monkeypatch):
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, (ana, rui) = _class("api", ["left", "right"])
        ids = (coach.user_id, instance.id, ana.player_id, rui.player_id)
    coach_user, instance_id, ana_id, rui_id = ids

    before = _rows(client, app, coach_user, instance_id)
    assert (before[ana_id]["side"], before[ana_id]["sideOverride"]) == ("left", False)
    assert before[ana_id]["sideEditable"] is True
    assert (before[rui_id]["side"], before[rui_id]["sideOverride"]) == ("right", False)

    res = _put(client, app, coach_user, instance_id, ana_id, "right")
    assert res.status_code == 200, res.get_json()
    assert (res.get_json()["side"], res.get_json()["sideOverride"]) == ("right", True)
    assert (_rows(client, app, coach_user, instance_id)[ana_id]["side"]) == "right"
    with app.app_context():
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

        assert Association_CoachPlayer.query.filter_by(player_id=ana_id).one().side == "left", "the usual side is untouched"

    res = _put(client, app, coach_user, instance_id, ana_id, None)
    assert res.status_code == 200
    assert (res.get_json()["side"], res.get_json()["sideOverride"]) == ("left", False)


def test_one_occurrence_only(app, client, monkeypatch):
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, (ana,) = _class("one", ["left"])
        from padel_app.services.lesson_service import enrol
        from padel_app.models.lesson_instances import LessonInstance

        other = LessonInstance(
            lesson_id=instance.lesson_id,
            start_datetime=instance.start_datetime + timedelta(days=7),
            end_datetime=instance.end_datetime + timedelta(days=7),
            max_players=instance.max_players,
        )
        db.session.add(other)
        db.session.flush()
        for rel in instance.coaches_relations:
            from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

            db.session.add(Association_CoachLessonInstance(coach_id=rel.coach_id, lesson_instance_id=other.id))
        enrol(ana.player_id, other, "roster", confirmed=True)
        db.session.commit()
        ids = (coach.user_id, instance.id, other.id, ana.player_id)
    coach_user, instance_id, other_id, ana_id = ids
    assert _put(client, app, coach_user, instance_id, ana_id, "right").status_code == 200
    assert _rows(client, app, coach_user, other_id)[ana_id]["side"] == "left"


@pytest.mark.parametrize("case, expected", [("both", 400), ("other_coach", 403), ("no_presence", 404), ("ended", 409)])
def test_refusals(app, client, monkeypatch, case, expected):
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, (ana,) = _class(f"no{case[:4]}", ["left"])
        user_id, player_id, side = coach.user_id, ana.player_id, "right"
        if case == "both":
            side = "both"
        elif case == "other_coach":
            user_id = _create_coach(f"p551other{case}").user_id
            db.session.commit()
        elif case == "no_presence":
            from padel_app.tests.test_effective_level_resolution import _create_coach_player

            player_id = _create_coach_player(coach, None, "p551-stranger").player_id
            db.session.commit()
        elif case == "ended":
            past = datetime.utcnow().replace(microsecond=0) - timedelta(days=2)
            instance.start_datetime, instance.end_datetime = past, past + timedelta(hours=1)
            db.session.commit()
        instance_id = instance.id
    res = _put(client, app, user_id, instance_id, player_id, side)
    assert res.status_code == expected, res.get_json()
    if case == "ended":
        assert all(r["sideEditable"] is False for r in _rows(client, app, user_id, instance_id).values())
    with app.app_context():
        from padel_app.models.presences import Presence

        row = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).first()
        assert row is None or row.side is None, "a refusal writes nothing"


def test_the_override_is_the_side_a_freed_spot_starts_from(app, monkeypatch):
    """3 left (Ana among them) + 2 right going. Ana cancels: 2 / 2, a tie keeps the leaver's side."""
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import _create_vacancy_for_absent_player
    from padel_app.services.presence_side_service import set_presence_side

    _patch_io(monkeypatch)
    with app.app_context():
        for overridden in (False, True):
            coach, instance, cps = _class(f"freed{int(overridden)}", ["left", "left", "left", "right", "right"])
            ana = cps[0].player_id
            if overridden:
                set_presence_side(coach, instance, ana, "right")
            Presence.query.filter_by(player_id=ana, lesson_instance_id=instance.id).one().status = "absent"
            db.session.commit()
            side = _create_vacancy_for_absent_player(instance, coach.id, ana).side
            assert side == ("right" if overridden else "left"), (overridden, side)


def test_the_override_counts_in_the_class_balance(app, monkeypatch):
    """2 left + Ana (left, set right) going; a left leaver's freed spot counts 1 left / 2 right."""
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import freed_spot_side_counts
    from padel_app.services.presence_side_service import set_presence_side

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, cps = _class("count", ["left", "left", "left", "right"])
        set_presence_side(coach, instance, cps[0].player_id, "right")
        leaver = cps[1].player_id
        Presence.query.filter_by(player_id=leaver, lesson_instance_id=instance.id).one().status = "absent"
        db.session.commit()
        counts = freed_spot_side_counts(instance, coach.id, leaver, "left")
        assert (counts["left"], counts["right"], counts["chosen"]) == (1, 2, "left")


def test_a_change_re_counts_the_open_spots_and_withdraws_for_balance(app, monkeypatch):
    """PAD-581's class: 1 left + 1 right going, never-filled spots left and right. The coach sets
    the right player left for this occurrence: going 2 / 0, so the left spot now asks right and its
    left round-1 invitation is withdrawn for balance."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.presence_side_service import set_presence_side

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("551")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        left_spot = spots["left"].id
        from padel_app.models.presences import Presence

        r0 = next(p.player_id for p in Presence.query.filter_by(lesson_instance_id=instance.id)
                  if p.player.user.username.endswith("-r0"))
        set_presence_side(coach, instance, r0, "left")
        db.session.expire_all()
        assert db.session.get(Vacancy, left_spot).side == "right"
        e = _event(ana)
        assert (e.status, e.retired_reason) == ("expired", "side_balanced")
        assert _bubble(ana)["response"] == "side_balanced"
