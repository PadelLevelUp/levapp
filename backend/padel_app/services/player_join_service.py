"""players.join-token — coach QR / link a signed-in student redeems (PAD-212).

Mirrors the invitation services (mint → public preview → accept, 404/410, expiry
flipped on read), with two differences the spec calls out: the token is reusable
and coach-scoped (one QR, many students) and rotation is the only revocation.
"""
import secrets
from datetime import timedelta

from flask import abort, current_app

from padel_app.models import (
    Association_CoachPlayer,
    Association_PlayerClub,
    CoachJoinToken,
)
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

JOIN_TOKEN_VALID_DAYS = 7
JOIN_PATH_PREFIX = "/join/coach/"


def join_token_path(token):
    return f"{JOIN_PATH_PREFIX}{token}"


def join_token_url(token):
    """Full URL when a public origin is configured, else the path (clients
    build the absolute link from their own origin, as the invite link does)."""
    origin = (current_app.config.get("PUBLIC_WEB_ORIGIN") or "").rstrip("/")
    path = join_token_path(token)
    return f"{origin}{path}" if origin else path


def _serialize_token(row):
    return {
        "token": row.token,
        "path": join_token_path(row.token),
        "url": join_token_url(row.token),
        "expiresAt": row.expires_at.isoformat(),
        "clubName": row.club.name if row.club else None,
        "uses": row.uses,
    }


def mint_join_token_service(coach, club, now=None):
    """Rule 1 / 6: retire every active token of the coach, mint a fresh one."""
    now = now or utcnow_naive()
    for old in CoachJoinToken.query.filter_by(coach_id=coach.id, is_active=True).all():
        old.is_active = False

    row = CoachJoinToken(
        coach_id=coach.id,
        club_id=club.id,
        token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(days=JOIN_TOKEN_VALID_DAYS),
        is_active=True,
        uses=0,
    )
    db.session.add(row)
    db.session.commit()
    return _serialize_token(row)


def get_active_join_token_service(coach, now=None):
    """Rule 2: the coach's active, unexpired token or None."""
    now = now or utcnow_naive()
    row = (
        CoachJoinToken.query.filter_by(coach_id=coach.id, is_active=True)
        .order_by(CoachJoinToken.id.desc())
        .first()
    )
    if row is None:
        return None
    if row.expires_at < now:
        row.is_active = False
        db.session.commit()
        return None
    return _serialize_token(row)


def _load_live_token(token, now=None):
    now = now or utcnow_naive()
    row = CoachJoinToken.query.filter_by(token=token).first()
    if row is None:
        abort(404, "Join link not found")
    if row.is_active and row.expires_at < now:
        row.is_active = False
        db.session.commit()
    if not row.is_active:
        abort(410, "Join link is no longer valid")
    return row


def get_join_token_preview_service(token, now=None):
    """Rule 4: public preview — who the student would be joining, nothing else."""
    row = _load_live_token(token, now=now)
    return {
        "coachName": row.coach.name,
        "clubName": row.club.name,
        "clubLogoUrl": row.club.logo_url,
    }


def accept_join_token_service(token, user, now=None):
    """Rule 5: the acting user (from the JWT) joins the coach's roster and club."""
    row = _load_live_token(token, now=now)

    if user.coach is not None:
        abort(403, "A coach account cannot join a roster")
    player = user.player
    if player is None:
        abort(403, "Only a student account can join a roster")

    already_member = (
        Association_CoachPlayer.query.filter_by(
            coach_id=row.coach_id, player_id=player.id
        ).first()
        is not None
    )
    if not already_member:
        db.session.add(
            Association_CoachPlayer(coach_id=row.coach_id, player_id=player.id)
        )
    if (
        Association_PlayerClub.query.filter_by(
            player_id=player.id, club_id=row.club_id
        ).first()
        is None
    ):
        db.session.add(Association_PlayerClub(player_id=player.id, club_id=row.club_id))

    row.uses = (row.uses or 0) + 1
    db.session.commit()
    return {
        "joined": True,
        "alreadyMember": already_member,
        "coachName": row.coach.name,
        "clubName": row.club.name,
    }
