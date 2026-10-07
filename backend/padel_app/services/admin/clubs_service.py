"""admin.clubs-and-switches rules 1–3 (PAD-533): clubs, their courts and coach↔club links, for staff.

Flush only: ``@audited`` commits the write and its audit row together (admin.foundation rule 8).
Services fill ``g.audit`` (target, before, after). The console never creates or deletes a club
(deleting one cascades to its lessons, R-003).
"""
from flask import g
from sqlalchemy import func

from padel_app.sql_db import db

PAGE_SIZE = 50
NAME_MAX = 255


class ClubFieldError(ValueError):
    """A club field failed clubs.crud's validation."""


def _counts(subject_col, key_col):
    return (
        db.session.query(key_col.label("club_id"), func.count(subject_col).label("n"))
        .group_by(key_col)
        .subquery()
    )


def _club_row(club, coaches=0, players=0, courts=0, lessons=0):
    return {
        "id": club.id,
        "name": club.name,
        "description": club.description,
        "location": club.location,
        "coaches": int(coaches or 0),
        "players": int(players or 0),
        "courts": int(courts or 0),
        "lessons": int(lessons or 0),
    }


def list_clubs(q=None, page=1):
    """Rule 1: clubs by name with their counts — one query per page, never one per club."""
    from padel_app.models import Association_CoachClub, Association_PlayerClub, Club, Court, Lesson

    page = max(1, int(page or 1))
    co = _counts(Association_CoachClub.id, Association_CoachClub.club_id)
    pl = _counts(Association_PlayerClub.id, Association_PlayerClub.club_id)
    ct = _counts(Court.id, Court.club_id)
    le = _counts(Lesson.id, Lesson.club_id)
    query = (
        db.session.query(Club, co.c.n, pl.c.n, ct.c.n, le.c.n)
        .outerjoin(co, co.c.club_id == Club.id)
        .outerjoin(pl, pl.c.club_id == Club.id)
        .outerjoin(ct, ct.c.club_id == Club.id)
        .outerjoin(le, le.c.club_id == Club.id)
    )
    term = (q or "").strip()
    if term:
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Club.name.ilike(f"%{escaped}%", escape="\\"))
    rows = query.order_by(func.lower(Club.name), Club.id).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).all()
    items = [_club_row(*row) for row in rows[:PAGE_SIZE]]
    return {"items": items, "page": page, "hasMore": len(rows) > PAGE_SIZE}


def _club_or_404(club_id):
    from flask import abort
    from padel_app.models import Club

    club = db.session.get(Club, club_id)
    if club is None:
        abort(404)
    return club


def club_detail(club_id):
    """Rule 1: the club with its courts in order and its linked coaches."""
    from padel_app.services.court_service import list_courts, serialize_court

    club = _club_or_404(club_id)
    listed = list_clubs_for_ids([club.id])
    row = listed[0] if listed else _club_row(club)
    coaches = []
    for rel in sorted(club.coaches_relations, key=lambda r: r.id):
        coach = rel.coach
        user = coach.user if coach is not None else None
        coaches.append({
            "coachId": rel.coach_id,
            "name": user.name if user else None,
            "email": user.email if user else None,
            "linkedAt": rel.created_at.isoformat() if getattr(rel, "created_at", None) else None,
        })
    return {**row, "courtsList": [serialize_court(c) for c in list_courts(club.id)], "coachesList": coaches}


def list_clubs_for_ids(ids):
    from padel_app.models import Association_CoachClub, Association_PlayerClub, Club, Court, Lesson

    co = _counts(Association_CoachClub.id, Association_CoachClub.club_id)
    pl = _counts(Association_PlayerClub.id, Association_PlayerClub.club_id)
    ct = _counts(Court.id, Court.club_id)
    le = _counts(Lesson.id, Lesson.club_id)
    rows = (
        db.session.query(Club, co.c.n, pl.c.n, ct.c.n, le.c.n)
        .outerjoin(co, co.c.club_id == Club.id)
        .outerjoin(pl, pl.c.club_id == Club.id)
        .outerjoin(ct, ct.c.club_id == Club.id)
        .outerjoin(le, le.c.club_id == Club.id)
        .filter(Club.id.in_(ids))
        .all()
    )
    return [_club_row(*row) for row in rows]


def _fields(club):
    return {"name": club.name, "description": club.description, "location": club.location}


def edit_club(club_id, data):
    """Rule 1: name, description, location — clubs.crud's limits (name 1–255, location ≤ 255)."""
    club = _club_or_404(club_id)
    data = data or {}
    before = _fields(club)
    if "name" in data:
        name = data["name"].strip() if isinstance(data["name"], str) else ""
        if not name or len(name) > NAME_MAX:
            raise ClubFieldError(f"name is 1 to {NAME_MAX} characters")
        club.name = name
    if "description" in data:
        value = data["description"]
        if value is not None and not isinstance(value, str):
            raise ClubFieldError("description must be text")
        club.description = (value or "").strip() or None
    if "location" in data:
        value = data["location"]
        if value is not None and (not isinstance(value, str) or len(value) > NAME_MAX):
            raise ClubFieldError(f"location is at most {NAME_MAX} characters")
        club.location = (value or "").strip() or None
    db.session.flush()
    g.audit.target("club", club.id)
    g.audit.before, g.audit.after = before, _fields(club)
    return club_detail(club.id)


# ── courts (rule 2): the coach routes' own service functions, with commit=False ─────────────

def _court_or_404(court_id):
    from flask import abort
    from padel_app.models import Court

    court = db.session.get(Court, court_id)
    if court is None:
        abort(404)
    return court


def _court_dict(court):
    return {"id": court.id, "clubId": court.club_id, "name": court.name, "position": court.position}


def add_court(club_id, data):
    from padel_app.services.court_service import create_court

    _club_or_404(club_id)
    court = create_court(club_id, data, commit=False)
    g.audit.target("court", court.id)
    g.audit.after = _court_dict(court)
    return court


def rename_court(court_id, data):
    from padel_app.services.court_service import rename_court as _rename

    court = _court_or_404(court_id)
    before = _court_dict(court)
    _rename(court, data, commit=False)
    g.audit.target("court", court.id)
    g.audit.before, g.audit.after = before, _court_dict(court)
    return court


def delete_court(court_id):
    from padel_app.services.court_service import delete_court as _delete

    court = _court_or_404(court_id)
    before = _court_dict(court)
    _delete(court, commit=False)
    g.audit.target("court", court_id)
    g.audit.before = before
    return {"deleted": True}


def reorder_courts(club_id, ids):
    from padel_app.services.court_service import list_courts, reorder_courts as _reorder, serialize_court

    _club_or_404(club_id)
    before = [c.id for c in list_courts(club_id)]
    courts = _reorder(club_id, ids, commit=False)
    g.audit.target("club", club_id)
    g.audit.before, g.audit.after = {"order": before}, {"order": [c.id for c in courts]}
    return [serialize_court(c) for c in courts]


# ── coach↔club links (rule 3) ─────────────────────────────────────────────────────────────────

def _coach_or_404(coach_id):
    from flask import abort
    from padel_app.models import Coach

    try:
        coach = db.session.get(Coach, int(coach_id))
    except (TypeError, ValueError):
        coach = None
    if coach is None:
        abort(404)
    return coach


def link_coach(club_id, coach_id):
    """Adding an existing link is 200 with no change."""
    from padel_app.models import Association_CoachClub

    club = _club_or_404(club_id)
    coach = _coach_or_404(coach_id)
    existing = Association_CoachClub.query.filter_by(coach_id=coach.id, club_id=club.id).first()
    g.audit.target("club", club.id)
    g.audit.after = {"coachId": coach.id, "clubId": club.id, "changed": existing is None}
    if existing is None:
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        db.session.flush()
        db.session.expire(coach, ["clubs_relations"])
    return {"linked": True, "changed": existing is None, "currentClubId": getattr(coach.current_club, "id", None)}


def unlink_coach(club_id, coach_id):
    """Removing a link never deletes lessons, players or club data; the last link is allowed and warned."""
    from flask import abort
    from padel_app.models import Association_CoachClub

    club = _club_or_404(club_id)
    coach = _coach_or_404(coach_id)
    rel = Association_CoachClub.query.filter_by(coach_id=coach.id, club_id=club.id).first()
    if rel is None:
        abort(404)
    db.session.delete(rel)
    db.session.flush()
    db.session.expire(coach, ["clubs_relations"])
    g.audit.target("club", club.id)
    g.audit.after = {"coachId": coach.id, "clubId": club.id}
    remaining = Association_CoachClub.query.filter_by(coach_id=coach.id).count()
    body = {"unlinked": True, "currentClubId": getattr(coach.current_club, "id", None)}
    if remaining == 0:
        body["warning"] = "COACH_HAS_NO_CLUB"
    return body
