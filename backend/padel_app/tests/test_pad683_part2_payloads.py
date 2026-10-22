"""PAD-683 part 2 — players.nickname rule 9a: the coach-private payloads that still printed the real
name (presence statistics, the validation list, the dashboard's rows, the claim candidates and the
duplicate hint, the invite tutorial's simulation) carry the REQUESTING coach's `displayName`;
`name` stays the real name and another coach's copy carries no nickname (rule 2).
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad274_deletes import _headers, _jwt, _second_coach, world  # noqa: F401
from padel_app.tests.test_pad660_coach_nickname import NICK, _rel, _share_with_coach_b


def _nick_on(app, world):
    with app.app_context():
        rel = _rel(world)
        rel.nickname, rel.nickname_as_name = NICK, True
        db.session.commit()


def _window():
    now = datetime.utcnow()
    return now - timedelta(days=30), now + timedelta(days=1)


def _own_the_class(world):
    from padel_app.models import Association_CoachLesson

    db.session.add(Association_CoachLesson(coach_id=world["coach_id"], lesson_id=world["lesson_id"]))
    db.session.commit()


def _row(rows, world):
    return next(r for r in rows if r["playerId"] == world["student_id"])


def test_presence_stats_and_the_validation_list_carry_the_asking_coachs_display_name(app, world):
    from padel_app.services.presence_overview_service import build_presence_stats, list_pending_validation

    _nick_on(app, world)
    start, end = _window()
    with app.app_context():
        _own_the_class(world)
        stats = _row(build_presence_stats(coach_id=world["coach_id"], range_start=start, range_end=end)["players"], world)
        listing = list_pending_validation(coach_id=world["coach_id"], range_start=start, range_end=end)
        classes = listing["pending"] + listing["validated"]
        listed = _row([p for c in classes for p in c["players"]], world)
    for row in (stats, listed):
        assert (row["name"], row["nickname"], row["nicknameAsName"], row["displayName"]) == (
            "Rui Student", NICK, True, NICK,
        )


def test_another_coachs_presence_stats_carry_no_nickname(app, world):
    from padel_app.services.presence_overview_service import build_presence_stats

    _nick_on(app, world)
    _user_b, coach_b = _share_with_coach_b(app, world)
    start, end = _window()
    with app.app_context():
        rows = build_presence_stats(coach_id=coach_b, range_start=start, range_end=end)["players"]
        row = _row(rows, world)
    assert (row["name"], row["nickname"], row["displayName"]) == ("Rui Student", None, "Rui Student")


def test_the_dashboards_incomplete_block_and_avatar_stack_name_the_student_as_the_coach_does(app, world):
    from padel_app.helpers.dashboard.coach_home import _roster
    from padel_app.models import LessonInstance
    from padel_app.services.profile_completeness_service import build_incomplete_players_block

    _nick_on(app, world)
    with app.app_context():
        rel = _rel(world)
        rel.level_id = None  # incomplete: the block lists the student
        db.session.commit()
        block = build_incomplete_players_block(coach_id=world["coach_id"])
        row = block["data"]["players"][0]
        instance = LessonInstance.query.filter_by(lesson_id=world["lesson_id"]).one()
        event = {"model": "LessonInstance", "originalId": instance.id}
        coach_stack = _roster(event, limit=4, coach_id=world["coach_id"])
        shared_stack = _roster(event, limit=4)
    assert (row["name"], row["displayName"]) == ("Rui Student", NICK)
    assert (coach_stack[0]["name"], coach_stack[0]["displayName"], coach_stack[0]["initials"]) == (
        "Rui Student", NICK, "JC",
    )
    # The student's dashboard shares the builder and never asks: no nickname key at all.
    assert "displayName" not in shared_stack[0] and "nickname" not in shared_stack[0]


def test_a_needs_you_reply_from_a_student_is_named_with_the_coachs_nickname(app, world):
    from padel_app.helpers.dashboard.coach_home import reply_items
    from padel_app.models import Conversation, ConversationParticipant, Message

    _nick_on(app, world)
    with app.app_context():
        conv = Conversation(participant_key=f"{world['coach_user_id']}-{world['student_user_id']}")
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=world["coach_user_id"]),
            ConversationParticipant(conversation_id=conv.id, user_id=world["student_user_id"]),
        ])
        db.session.add(Message(conversation_id=conv.id, sender_id=world["student_user_id"], text="oi"))
        db.session.commit()
        coach_items = reply_items(user_id=world["coach_user_id"], coach_id=world["coach_id"])
        plain_items = reply_items(user_id=world["coach_user_id"])
    assert (coach_items[0]["personName"], coach_items[0]["displayName"], coach_items[0]["initials"]) == (
        "Rui Student", NICK, "JC",
    )
    assert "displayName" not in plain_items[0]


def test_the_messageable_list_keeps_its_public_shape_and_never_carries_a_nickname(app, client, world):
    """messaging.conversations rule 15 pins the picker's public shape (audit H3): the coach's
    picker resolves the nickname from its own roster by user id, so nothing is added here."""
    _nick_on(app, world)
    res = client.get("/api/app/messageable-users", headers=_headers(app, world["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    row = next(r for r in res.get_json() if r["id"] == world["student_user_id"])
    assert "playerId" not in row and "displayName" not in row
    assert NICK not in str(res.get_json())


# --- claim candidates and the duplicate hint -----------------------------------------------------


def _claim_world(app):
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    from padel_app.tools.username_tools import unique_placeholder_username

    with app.app_context():
        def make(name, username, coach, status="active", password="h"):
            u = User(name=name, username=username, email=f"{username}@t.com", password=password, status=status)
            db.session.add(u)
            db.session.flush()
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            rel = Association_CoachPlayer(coach_id=coach.id, player_id=p.id)
            db.session.add(rel)
            db.session.flush()
            return p, rel

        users = {}
        for key in ("a", "b"):
            u = User(name=f"Coach {key}", username=f"c683_{key}", email=f"c683{key}@t.com", password="h")
            db.session.add(u)
            db.session.flush()
            c = Coach(user_id=u.id)
            db.session.add(c)
            db.session.flush()
            users[key] = (u, c)
        a, b = users["a"][1], users["b"][1]
        placeholder, rel_ph = make("Rui P. Basto", unique_placeholder_username(), a, status="inactive", password=None)
        real, rel_real = make("Rui P. Basto", "real683", a)
        rel_real.nickname, rel_real.nickname_as_name = "Basto do Norte", True
        db.session.add(Association_CoachPlayer(coach_id=b.id, player_id=real.id))
        db.session.commit()
        return dict(a=a.id, a_user=users["a"][0].id, b=b.id, placeholder=placeholder.id,
                    real=real.id, rel_ph=rel_ph.id)


def test_claim_candidates_carry_the_display_name_and_are_found_by_the_nickname(app, client, world):
    ids = _claim_world(app)
    res = client.get(
        f"/api/app/player/{ids['placeholder']}/claim-candidates?search=norte",
        headers=_headers(app, ids["a_user"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    body = res.get_json()
    rows = body if isinstance(body, list) else body["items"]
    assert [r["playerId"] for r in rows] == [ids["real"]], "found by the nickname alone"
    assert (rows[0]["name"], rows[0]["nickname"], rows[0]["displayName"]) == (
        "Rui P. Basto", "Basto do Norte", "Basto do Norte",
    )


def test_the_duplicate_hint_names_the_other_student_as_this_coach_does(app, world):
    from padel_app.models import Association_CoachPlayer, Coach
    from padel_app.services.player_service import possible_duplicates_for

    ids = _claim_world(app)
    with app.app_context():
        rel_ph = db.session.get(Association_CoachPlayer, ids["rel_ph"])
        hint = possible_duplicates_for(db.session.get(Coach, ids["a"]), [rel_ph])[rel_ph.id]
    assert (hint["playerId"], hint["name"], hint["displayName"]) == (
        ids["real"], "Rui P. Basto", "Basto do Norte",
    )


# --- invite tutorial ----------------------------------------------------------------------------


def test_the_invite_simulation_names_each_student_as_the_asking_coach_does(app):
    from padel_app.models import Association_CoachPlayer
    from padel_app.tests.test_pad128_eligibility import _seed
    from padel_app.tests.test_pad196_invite_simulation import (
        _explain, _mixed_roster, _no_batch_cap, _simulate,
    )
    from padel_app.utils.dates import utcnow_naive

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, roster = _mixed_roster(ids)
        _no_batch_cap(ids["coach_id"])
        target = roster[0]
        rel = Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"], player_id=target).one()
        rel.nickname, rel.nickname_as_name = NICK, True
        db.session.commit()

        simulation = _simulate(ids, alice, now=utcnow_naive())
        row = next(c for r in simulation["rounds"] for c in r["candidates"] if c["playerId"] == str(target))
        explained = _explain(ids, alice, target, now=utcnow_naive())
    assert row["displayName"] == NICK and row["name"] != NICK
    assert explained["displayName"] == NICK and explained["name"] == row["name"]
