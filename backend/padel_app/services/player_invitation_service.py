import secrets
from datetime import datetime, timedelta

from flask import abort
from werkzeug.security import generate_password_hash

from padel_app.services.level_service import set_roster_level
from padel_app.models import (
    Association_CoachPlayer,
    Player,
    PlayerInvitation,
    PlayerLevelHistory,
    User,
)
from padel_app.sql_db import db
from padel_app.tools.username_tools import unique_placeholder_username

PLAYER_INVITATION_VALID_DAYS = 7


def create_incomplete_player_service(data, now=None):
    if not data.get("coachId"):
        abort(400, "coachId is required")
    if not data.get("name"):
        abort(400, "name is required")

    user = User(
        name=data["name"],
        username=unique_placeholder_username(),
        email=data.get("email") or None,
        password=None,
        status="inactive",
    )
    db.session.add(user)
    db.session.flush()

    player = Player(user_id=user.id)
    db.session.add(player)
    db.session.flush()

    rel = Association_CoachPlayer(
        coach_id=int(data["coachId"]),
        player_id=player.id,
        side=data.get("side") or None,
        notes=data.get("notes") or None,
    )
    db.session.add(rel)
    # PAD-270: the one writer of a roster level also records the history row.
    set_roster_level(rel, data.get("levelId"))

    invitation = PlayerInvitation(
        player_id=player.id,
        token=secrets.token_urlsafe(32),
        invited_by_coach_id=int(data["coachId"]),
        status="pending",
        expires_at=(now or datetime.utcnow())
        + timedelta(days=PLAYER_INVITATION_VALID_DAYS),
    )
    db.session.add(invitation)
    db.session.commit()
    return invitation


def get_player_invitation_service(token, now=None):
    invitation = PlayerInvitation.query.filter_by(token=token).first()
    if invitation is None:
        abort(404, "Invitation not found")

    if invitation.status == "pending" and invitation.expires_at < (
        now or datetime.utcnow()
    ):
        invitation.status = "expired"
        db.session.commit()

    if invitation.status != "pending":
        abort(410, f"Invitation is {invitation.status}")

    return invitation


def accept_player_invitation_service(token, data=None, now=None):
    invitation = get_player_invitation_service(token, now=now)

    data = data or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        abort(400, "username and password are required")

    existing = User.query.filter_by(username=username).first()
    if existing is not None and existing.id != invitation.player.user_id:
        abort(409, "Username already taken")

    user = invitation.player.user
    user.username = username
    user.password = generate_password_hash(password)
    if data.get("email"):
        user.email = data["email"]
    if data.get("phone"):
        user.phone = data["phone"]
    user.status = "active"

    invitation.status = "accepted"
    db.session.commit()
    return user


def claim_player_invitation_service(token, user, now=None):
    """players.claim trigger A: the invitee already has an account.

    Validates the token exactly as ``accept`` does (404 unknown, 410 used /
    revoked / expired), then folds the coach-created placeholder into the
    signed-in student's account and marks the invitation accepted. 403 for a
    coach account or an account with no Player; 409 ALREADY_ACTIVATED if the
    placeholder was activated meanwhile.
    """
    from padel_app.services.player_claim_service import merge_placeholder_player_into

    invitation = get_player_invitation_service(token, now=now)
    if user is None or user.coach is not None or user.player is None:
        abort(403, "Only a student account can link a player record")

    coach = invitation.invited_by_coach
    coach_name = coach.name if coach else None
    # The merge re-points and accepts this invitation itself (rule 5d).
    merge_placeholder_player_into(invitation.player, user)
    return {"merged": True, "coachName": coach_name}


def revoke_player_invitation_service(token, coach):
    invitation = PlayerInvitation.query.filter_by(token=token).first()
    if invitation is None:
        abort(404, "Invitation not found")

    if coach is None or coach.id != invitation.invited_by_coach_id:
        abort(403, "Only the inviting coach can revoke this invitation")

    if invitation.status != "pending":
        abort(410, f"Invitation is {invitation.status}")

    invitation.status = "revoked"
    db.session.commit()
    return invitation
