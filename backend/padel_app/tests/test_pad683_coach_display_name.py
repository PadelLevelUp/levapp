"""PAD-683 — players.nickname: every coach view shows the coach's display name (B-631).

The invite picker (`GET notify/groups`) and the coach's own search rows carried only the real
`name`, so a coach with "Usar alcunha como nome principal" on saw the real name when inviting.
Coach-private payloads carry the requesting coach's `nickname` / `nicknameAsName` / `displayName`;
`name` stays the real name; another coach never sees it.
"""
from padel_app.sql_db import db
from padel_app.tests.test_pad274_deletes import _headers, _jwt, _second_coach, world  # noqa: F401
from padel_app.tests.test_pad660_coach_nickname import NICK, _rel, _set_nickname, _share_with_coach_b


def _nickname_on(app, client, world):
    res = _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    assert res.status_code == 200, res.get_data(as_text=True)


def test_the_invite_pickers_group_row_carries_the_coachs_display_name(app, client, world):
    from padel_app.services.notification_service import _serialize_cp_for_group

    _nickname_on(app, client, world)
    with app.app_context():
        row = _serialize_cp_for_group(_rel(world))
    assert (row["name"], row["nickname"], row["nicknameAsName"], row["displayName"]) == (
        "Rui Student", NICK, True, NICK,
    )


def test_the_group_row_of_another_coach_carries_no_nickname(app, client, world):
    from padel_app.models import Association_CoachPlayer
    from padel_app.services.notification_service import _serialize_cp_for_group

    _nickname_on(app, client, world)
    _user_id, coach_b = _share_with_coach_b(app, world)
    with app.app_context():
        rel_b = Association_CoachPlayer.query.filter_by(
            coach_id=coach_b, player_id=world["student_id"]
        ).one()
        row = _serialize_cp_for_group(rel_b)
    assert (row["nickname"], row["displayName"]) == (None, "Rui Student")


def test_the_coachs_player_search_carries_the_display_name(app, client, world):
    _nickname_on(app, client, world)
    res = client.get(
        "/api/app/notify/player_search?q=chato", headers=_headers(app, world["coach_user_id"])
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    rows = res.get_json()
    rows = rows if isinstance(rows, list) else rows.get("players", rows.get("items", []))
    row = next(r for r in rows if str(r["id"]) == str(world["student_id"]))
    assert (row["name"], row["displayName"]) == ("Rui Student", NICK)
