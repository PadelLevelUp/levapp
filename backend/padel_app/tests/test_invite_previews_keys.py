"""auth.invite-welcome (UI idea 8), criterion 3, the backend half: the three public previews behind the join and
invitation pages answer a signed-out caller with exactly the keys they answer today. The pages' navy band adds
no fact; a new key on any of them is a data decision and breaks this test first."""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


def _auth(app, user_id):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _coach_with_club(app):
    """An approved coach in one club; returns (user_id, coach_id, club_id)."""
    from padel_app.models import Association_CoachClub, Club, Coach, User

    with app.app_context():
        user = User(name="Maria Coach", username="maria_coach", email="maria@example.com", password="pw", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach)
        db.session.flush()
        club = Club(name="Padel Academy")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        db.session.commit()
        return user.id, coach.id, club.id


@pytest.mark.criterion("AUTH-INVITE-WELCOME-3")
def test_public_preview_key_sets(client, app):
    from padel_app.models import CoachInvitation

    user_id, coach_id, club_id = _coach_with_club(app)

    # The join page's preview: who the student would join, from a minted code.
    minted = client.post("/api/app/coach/join-token", headers=_auth(app, user_id))
    assert minted.status_code == 201, minted.get_json()
    join = client.get(f"/api/app/join-tokens/{minted.get_json()['token']}")
    assert join.status_code == 200
    assert set(join.get_json()) == {"coachName", "clubName", "clubLogoUrl"}

    # The coach invitation's preview: the club.
    with app.app_context():
        invitation = CoachInvitation(
            club_id=club_id,
            token="coach-invite-token",
            invited_by_coach_id=coach_id,
            status="pending",
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(invitation)
        db.session.commit()
    coach = client.get("/api/app/coach-invitations/coach-invite-token")
    assert coach.status_code == 200
    assert set(coach.get_json()) == {"clubName", "status"}

    # The player invitation's preview: the invited player's own name and the invitation's status.
    created = client.post(
        "/api/app/incomplete_player",
        json={"coachId": coach_id, "name": "Ana Invited"},
        headers=_auth(app, user_id),
    )
    assert created.status_code == 201, created.get_json()
    player = client.get(f"/api/app/player-invitations/{created.get_json()['token']}")
    assert player.status_code == 200
    assert set(player.get_json()) == {"playerName", "status"}
