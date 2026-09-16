"""clubs.courts (PAD-194 v1): membership-scoped CRUD and ordering of a club's
courts, and the check a class's court belongs to its club."""
from flask import abort

from padel_app.sql_db import db

NAME_MAX = 80


class InvalidCourtError(ValueError):
    code = "invalid_court"


class CourtNotInClubError(ValueError):
    code = "court_not_in_club"

    def __init__(self):
        super().__init__("That court does not belong to this class's club")


def require_club_member(coach, club_id):
    """Rule 1: the caller must be a coach of the club, else 403."""
    from padel_app.models import Association_CoachClub

    if coach is None or not Association_CoachClub.query.filter_by(coach_id=coach.id, club_id=club_id).first():
        abort(403)


def list_courts(club_id):
    from padel_app.models import Court

    return Court.query.filter_by(club_id=club_id).order_by(Court.position, Court.id).all()


def serialize_court(court):
    return court.frontend_dict()


def _clean_name(club_id, raw, *, exclude_id=None):
    from padel_app.models import Court

    name = raw.strip() if isinstance(raw, str) else ""
    if not name or len(name) > NAME_MAX:
        raise InvalidCourtError(f"A court name is 1 to {NAME_MAX} characters")
    for other in Court.query.filter_by(club_id=club_id).all():
        if other.id != exclude_id and other.name.strip().lower() == name.lower():
            raise InvalidCourtError("A court with that name already exists in this club")
    return name


def create_court(club_id, data):
    from padel_app.models import Court

    name = _clean_name(club_id, (data or {}).get("name"))
    existing = list_courts(club_id)
    court = Court(club_id=club_id, name=name, position=len(existing))
    db.session.add(court)
    db.session.commit()
    return court


def rename_court(court, data):
    if "name" in (data or {}):
        court.name = _clean_name(court.club_id, data.get("name"), exclude_id=court.id)
    db.session.commit()
    return court


def delete_court(court):
    """Rule 4: classes on the court keep running with no court (FK SET NULL is
    also applied explicitly, for SQLite in tests)."""
    from padel_app.models import Lesson

    for lesson in Lesson.query.filter_by(court_id=court.id).all():
        lesson.court_id = None
    db.session.delete(court)
    db.session.commit()


def reorder_courts(club_id, ids):
    """Rule 5: `ids` must be exactly the club's court ids."""
    courts = {c.id: c for c in list_courts(club_id)}
    try:
        wanted = [int(i) for i in (ids or [])]
    except (TypeError, ValueError):
        raise InvalidCourtError("ids must be court ids")
    if sorted(wanted) != sorted(courts) or len(wanted) != len(set(wanted)):
        raise InvalidCourtError("ids must list every court of the club exactly once")
    for position, court_id in enumerate(wanted):
        courts[court_id].position = position
    db.session.commit()
    return list_courts(club_id)


def resolve_court_for_club(club_id, court_id):
    """Rule 6: `court_id` None → None; otherwise the court, which must belong to
    `club_id`, else CourtNotInClubError."""
    from padel_app.models import Court

    if court_id in (None, "", "null"):
        return None
    try:
        court = Court.query.get(int(court_id))
    except (TypeError, ValueError):
        court = None
    if court is None or court.club_id != club_id:
        raise CourtNotInClubError()
    return court
