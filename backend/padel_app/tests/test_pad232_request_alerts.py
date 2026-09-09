"""PAD-232 — notifications.request-alerts.

The people who can act on a pending request are told over web push, native
push and email the moment it arrives; the requester is told the decision; an
explicit opt-out silences every channel; nothing here can fail the request.
"""
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

SVC = "padel_app.services.request_alert_service"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _user(name, username, **kw):
    from padel_app.models import User
    u = User(name=name, username=username, email=f"{username}@test.com",
             password="x", status="active", language="en", **kw)
    db.session.add(u)
    db.session.flush()
    return u


def _coach(name, username, club=None, **kw):
    from padel_app.models import Association_CoachClub
    from padel_app.models.coaches import Coach
    user = _user(name, username, **kw)
    coach = Coach(user_id=user.id, approval_status="approved")
    db.session.add(coach)
    db.session.flush()
    if club is not None:
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        db.session.flush()
    return coach


def _club(name="Norte"):
    from padel_app.models.clubs import Club
    club = Club(name=name, description="", location="City")
    db.session.add(club)
    db.session.flush()
    return club


def _channels():
    """Patch the three channels where the service resolves them (rule 2)."""
    return (
        patch("padel_app.utils.push_notifications.send_push_notification"),
        patch("padel_app.utils.expo_push.send_expo_push_to_user"),
        patch("padel_app.tools.email_tools.send_email"),
    )


def _recipient_ids(mock):
    return sorted(call.args[0] for call in mock.call_args_list)


def test_render_copy_substitutes_every_placeholder():
    from padel_app.services.request_alert_service import COPY, render_copy
    for kind in COPY:
        for lang in ("pt", "en"):
            title, body = render_copy(kind, lang, actor="Rui", club="Norte",
                                      player="Placeholder", decision="approved")
            assert "{" not in title + body, (kind, lang, title, body)


def test_club_join_request_alerts_club_members_not_requester_and_respects_optout(app):
    from padel_app.services.club_service import create_club_join_request_service
    with app.app_context():
        club = _club()
        ana = _coach("Ana", "ana-232", club)
        bruno = _coach("Bruno", "bruno-232", club, notif_request_alerts=False)
        rui = _coach("Rui", "rui-232")
        db.session.commit()
        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo as expo, p_mail as mail:
            create_club_join_request_service(club.id, rui)

        # Ana only: Bruno opted out (rule 3), Rui is the requester (rule 1).
        assert _recipient_ids(web) == [ana.user_id]
        assert _recipient_ids(expo) == [ana.user_id]
        assert [c.args[1] for c in mail.call_args_list] == [[ana.user.email]]
        title, body = web.call_args.args[1], web.call_args.args[2]
        assert "Rui" in body and "Norte" in body
        assert web.call_args.kwargs["url"] == "/settings?section=club"
        assert expo.call_args.kwargs["data"] == {"type": "request", "kind": "club_join.received"}
        assert mail.call_args.args[0].startswith("[LevApp]")
        assert "Rui" in mail.call_args.kwargs["body"]
        assert "Open LevApp" in mail.call_args.kwargs["html"]


def test_club_join_decision_alerts_requester_with_the_decision(app):
    from padel_app.services.club_service import (
        create_club_join_request_service, decide_club_join_request_service,
    )
    with app.app_context():
        club = _club()
        ana = _coach("Ana", "ana-232b", club)
        rui = _coach("Rui", "rui-232b")
        db.session.commit()
        p_web, p_expo, p_mail = _channels()
        with p_web, p_expo, p_mail:
            req = create_club_join_request_service(club.id, rui)
        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo, p_mail as mail:
            decide_club_join_request_service(req.id, ana, approve=False)
        assert _recipient_ids(web) == [rui.user_id]
        assert "declined" in web.call_args.args[2]
        assert "Norte" in web.call_args.args[2]
        assert mail.call_count == 1


def test_claim_request_alerts_invited_account_then_coach_on_decision(app):
    from padel_app.models.players import Player
    from padel_app.models import Association_CoachPlayer
    from padel_app.services.player_claim_service import (
        create_claim_request_service, decide_claim_request_service,
    )
    with app.app_context():
        ana = _coach("Ana", "ana-232c")
        rui = _user("Rui", "rui-232c")
        db.session.add(Player(user_id=rui.id))
        # A claimable placeholder on Ana's roster: no password, placeholder username.
        from padel_app.models import User
        from padel_app.tools.username_tools import unique_placeholder_username
        ph_user = User(name="Rui Placeholder", username=unique_placeholder_username(),
                       email=None, password=None, status="inactive")
        db.session.add(ph_user)
        db.session.flush()
        ph = Player(user_id=ph_user.id)
        db.session.add(ph)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=ana.id, player_id=ph.id))
        db.session.commit()

        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo as expo, p_mail as mail:
            req = create_claim_request_service(ph.id, ana, "rui-232c")
        assert _recipient_ids(web) == [rui.id]
        assert "Ana" in web.call_args.args[2] and "Rui Placeholder" in web.call_args.args[2]
        assert expo.call_args.kwargs["data"]["kind"] == "claim.received"
        assert mail.call_count == 1

        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo, p_mail:
            decide_claim_request_service(req.id, rui, accept=False)
        assert _recipient_ids(web) == [ana.user_id]
        assert "declined" in web.call_args.args[2]


def test_pending_coach_alerts_superadmins_and_approval_alerts_the_coach(app):
    from padel_app.services.coach_approval_service import (
        approve_coach_service, notify_admin_of_pending_coach,
    )
    with app.app_context():
        admin = _user("Admin", "admin-232", is_superadmin=True)
        muted_admin = _user("Muted", "muted-232", is_superadmin=True,
                            notif_request_alerts=False)
        pending = _coach("Novo", "novo-232")
        pending.approval_status = "pending"
        db.session.commit()
        app.config["ADMIN_NOTIFY_EMAIL"] = None

        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo as expo, p_mail:
            notify_admin_of_pending_coach(pending)
        assert _recipient_ids(web) == [admin.id]
        assert expo.call_args.kwargs["data"]["kind"] == "coach_approval.received"
        assert "Novo" in web.call_args.args[2]

        p_web, p_expo, p_mail = _channels()
        with p_web as web, p_expo as expo, patch(
            "padel_app.services.coach_approval_service._send"
        ):
            approve_coach_service(pending.id, admin)
        assert _recipient_ids(web) == [pending.user_id]
        assert expo.call_args.kwargs["data"]["kind"] == "coach_approval.decided"


def test_channel_failure_never_fails_the_request(app):
    from padel_app.services.club_service import create_club_join_request_service
    with app.app_context():
        club = _club()
        _coach("Ana", "ana-232d", club)
        rui = _coach("Rui", "rui-232d")
        db.session.commit()
        with patch("padel_app.utils.push_notifications.send_push_notification",
                   side_effect=RuntimeError("boom")), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user",
                   side_effect=RuntimeError("boom")), \
             patch("padel_app.tools.email_tools.send_email",
                   side_effect=RuntimeError("boom")):
            req = create_club_join_request_service(club.id, rui)
        assert req.status == "pending"


def test_me_exposes_and_updates_request_alerts(client, app):
    with app.app_context():
        user = _user("Pref", "pref-232")
        db.session.commit()
        token = create_access_token(identity=str(user.id))
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/auth/me", headers=headers).get_json()
    assert me["requestAlerts"] is True
    res = client.patch("/api/auth/me", json={"requestAlerts": False}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["requestAlerts"] is False
    assert client.get("/api/auth/me", headers=headers).get_json()["requestAlerts"] is False
