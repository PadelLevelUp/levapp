import secrets
from datetime import datetime, timedelta

from flask import abort
from werkzeug.security import generate_password_hash

from padel_app.models import (
    Association_CoachClub,
    Club,
    Coach,
    CoachInvitation,
    User,
)
from padel_app.sql_db import db
from padel_app.tools.request_adapter import JsonRequestAdapter

COACH_INVITATION_VALID_DAYS = 7


def create_club_service(data):
    club = Club()
    form = club.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    club.update_with_dict(values)
    club.create()
    return club


def edit_club_service(club_id, data):
    # NOTE: original code queried User model for club_id — preserved as-is
    club = User.query.get_or_404(club_id)

    form = club.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    club.update_with_dict(values)
    club.save()
    return club


# -------------------------------------------------------------------
# Coach invitations (clubs.coach-invitation)
# -------------------------------------------------------------------

def _is_club_member(coach, club_id):
    if coach is None:
        return False
    return (
        Association_CoachClub.query.filter_by(
            coach_id=coach.id, club_id=club_id
        ).first()
        is not None
    )


def create_coach_invitation_service(club_id, coach, email=None, now=None):
    Club.query.get_or_404(club_id)

    if coach is None or not _is_club_member(coach, club_id):
        abort(403, "Only a coach belonging to this club can create invitations")

    invitation = CoachInvitation(
        club_id=club_id,
        token=secrets.token_urlsafe(32),
        email=email,
        invited_by_coach_id=coach.id,
        status="pending",
        expires_at=(now or datetime.utcnow())
        + timedelta(days=COACH_INVITATION_VALID_DAYS),
    )
    db.session.add(invitation)
    db.session.commit()
    return invitation


def get_coach_invitation_service(token, now=None):
    invitation = CoachInvitation.query.filter_by(token=token).first()
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


def accept_coach_invitation_service(token, data=None, coach=None, now=None):
    invitation = get_coach_invitation_service(token, now=now)

    if coach is not None:
        # Existing-coach path: only create the association (no-op if member)
        if not _is_club_member(coach, invitation.club_id):
            db.session.add(
                Association_CoachClub(
                    coach_id=coach.id, club_id=invitation.club_id
                )
            )
        invitation.status = "accepted"
        db.session.commit()
        return None

    # New-user path: register User + Coach and join the club
    data = data or {}
    name = data.get("name")
    username = data.get("username")
    password = data.get("password")
    if not name or not username or not password:
        abort(400, "name, username and password are required")

    if User.query.filter_by(username=username).first() is not None:
        abort(409, "Username already taken")

    user = User(
        name=name,
        username=username,
        email=data.get("email") or invitation.email,
        password=generate_password_hash(password),
        status="active",
    )
    db.session.add(user)
    db.session.flush()

    # auth.coach-approval rule 1: an existing club member vouched for them.
    new_coach = Coach(user_id=user.id, approval_status="approved")
    db.session.add(new_coach)
    db.session.flush()

    from padel_app.services.coach_service import create_default_levels_for_coach

    create_default_levels_for_coach(new_coach)

    db.session.add(
        Association_CoachClub(coach_id=new_coach.id, club_id=invitation.club_id)
    )
    invitation.status = "accepted"
    db.session.commit()
    return user


def revoke_coach_invitation_service(token, coach):
    invitation = CoachInvitation.query.filter_by(token=token).first()
    if invitation is None:
        abort(404, "Invitation not found")

    if coach is None or not _is_club_member(coach, invitation.club_id):
        abort(403, "Only a coach belonging to this club can revoke invitations")

    if invitation.status != "pending":
        abort(410, f"Invitation is {invitation.status}")

    invitation.status = "revoked"
    db.session.commit()
    return invitation


def list_coach_invitations_service(club_id, coach):
    Club.query.get_or_404(club_id)

    if coach is None or not _is_club_member(coach, club_id):
        abort(403, "Only a coach belonging to this club can list invitations")

    return (
        CoachInvitation.query.filter_by(club_id=club_id, status="pending")
        .order_by(CoachInvitation.created_at.desc())
        .all()
    )


# -------------------------------------------------------------------
# Club join requests (clubs.join-request, PAD-211)
# -------------------------------------------------------------------
#
# The mirror image of coach invitations: there the member acts first, here the
# newcomer does. Both end in the same `Association_CoachClub` row. Only an
# *approved* coach reaches these (the routes go through `require_coach()`),
# so a coach the LevApp admin has not approved cannot even search for a club.

from padel_app.models import ClubJoinRequest  # noqa: E402  (appended section)
from padel_app.utils.dates import utcnow_naive  # noqa: E402

CLUB_SEARCH_MIN_CHARS = 2
CLUB_SEARCH_LIMIT = 20


def search_clubs_service(term, limit=CLUB_SEARCH_LIMIT):
    """clubs.join-request rule 1 — name search, no membership information."""
    term = (term or "").strip()
    if len(term) < CLUB_SEARCH_MIN_CHARS:
        return []
    return (
        Club.query.filter(Club.name.ilike(f"%{term}%"))
        .order_by(Club.name.asc())
        .limit(limit)
        .all()
    )


def serialize_club_search_result(club):
    return {
        "id": club.id,
        "name": club.name,
        "location": club.location,
        "logoUrl": club.logo_url,
    }


def _pending_request(club_id, coach_id):
    return ClubJoinRequest.query.filter_by(
        club_id=club_id, coach_id=coach_id, status="pending"
    ).first()


def create_club_join_request_service(club_id, coach, now=None):
    """Rule 2 — 404 unknown club, 409 already a member or already pending."""
    Club.query.get_or_404(club_id)
    if _is_club_member(coach, club_id):
        abort(409, "Already a member of this club")
    if _pending_request(club_id, coach.id) is not None:
        abort(409, "A join request for this club is already pending")

    request_row = ClubJoinRequest(
        club_id=club_id,
        coach_id=coach.id,
        status="pending",
        requested_at=now or utcnow_naive(),
    )
    db.session.add(request_row)
    db.session.commit()
    # PAD-232: tell the club's coaches (never the requester) — best-effort.
    from padel_app.services.request_alert_service import (
        club_member_users, notify_request_event,
    )
    club = Club.query.get(club_id)
    notify_request_event(
        "club_join.received",
        club_member_users(club_id, exclude_coach_id=coach.id),
        actor=coach.user.name if coach.user else "",
        club=club.name if club else "",
    )
    return request_row


def list_club_join_requests_service(club_id, coach):
    """Rule 3 — pending requests, members of the club only."""
    Club.query.get_or_404(club_id)
    if coach is None or not _is_club_member(coach, club_id):
        abort(403, "Only a coach belonging to this club can list join requests")
    return (
        ClubJoinRequest.query.filter_by(club_id=club_id, status="pending")
        .order_by(ClubJoinRequest.requested_at.asc(), ClubJoinRequest.id.asc())
        .all()
    )


def decide_club_join_request_service(request_id, coach, approve, now=None):
    """Rule 4 — approve (membership) or reject; members of the club only."""
    request_row = ClubJoinRequest.query.get_or_404(request_id)
    if coach is None or not _is_club_member(coach, request_row.club_id):
        abort(403, "Only a coach belonging to this club can decide join requests")
    if request_row.status != "pending":
        abort(410, f"Join request is {request_row.status}")

    if approve:
        if not _is_club_member(request_row.coach, request_row.club_id):
            db.session.add(
                Association_CoachClub(
                    coach_id=request_row.coach_id, club_id=request_row.club_id
                )
            )
        request_row.status = "approved"
    else:
        request_row.status = "rejected"
    request_row.decided_at = now or utcnow_naive()
    request_row.decided_by_coach_id = coach.id
    db.session.commit()
    # PAD-232: the requester hears the decision.
    from padel_app.services.request_alert_service import notify_request_event
    requester = request_row.coach.user if request_row.coach else None
    club = Club.query.get(request_row.club_id)
    notify_request_event(
        "club_join.decided",
        [requester],
        club=club.name if club else "",
        decision=request_row.status,
    )
    return request_row


def withdraw_club_join_request_service(request_id, coach, now=None):
    """Rule 5 — the requesting coach takes it back."""
    request_row = ClubJoinRequest.query.get_or_404(request_id)
    if coach is None or coach.id != request_row.coach_id:
        abort(403, "Only the requesting coach can withdraw this request")
    if request_row.status != "pending":
        abort(410, f"Join request is {request_row.status}")
    request_row.status = "withdrawn"
    request_row.decided_at = now or utcnow_naive()
    db.session.commit()
    return request_row


def latest_pending_club_join_request(coach):
    """Rule 6 — what `/api/auth/me` reports as `pendingClubJoinRequest`."""
    if coach is None:
        return None
    return (
        ClubJoinRequest.query.filter_by(coach_id=coach.id, status="pending")
        .order_by(ClubJoinRequest.requested_at.desc(), ClubJoinRequest.id.desc())
        .first()
    )


def serialize_club_join_request(request_row):
    return {
        "id": request_row.id,
        "clubId": request_row.club_id,
        "clubName": request_row.club.name if request_row.club else None,
        "coachId": request_row.coach_id,
        "coachName": request_row.coach.name if request_row.coach else None,
        "status": request_row.status,
        "requestedAt": request_row.requested_at.isoformat() if request_row.requested_at else None,
    }
