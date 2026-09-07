"""clubs.join-request — an approved coach asks to join an existing club; a member decides (PAD-211)."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _make_user(app, username, *, email=None):
    from padel_app.models import User

    with app.app_context():
        user = User(name=username.title(), username=username, email=email,
                    password="pw", status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _make_coach(app, username, *, status="approved", club_id=None):
    """Returns (user_id, coach_id). `status` is the approval state."""
    from padel_app.models import Coach, Association_CoachClub

    user_id = _make_user(app, username)
    with app.app_context():
        coach = Coach(user_id=user_id, approval_status=status)
        db.session.add(coach)
        db.session.flush()
        if club_id is not None:
            db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club_id))
        db.session.commit()
        return user_id, coach.id


def _make_student(app, username):
    from padel_app.models import Player

    user_id = _make_user(app, username)
    with app.app_context():
        db.session.add(Player(user_id=user_id))
        db.session.commit()
    return user_id


def _make_club(app, name, location=None):
    from padel_app.models import Club

    with app.app_context():
        club = Club(name=name, location=location)
        db.session.add(club)
        db.session.commit()
        return club.id


def _request_row(app, request_id):
    from padel_app.models import ClubJoinRequest

    with app.app_context():
        row = ClubJoinRequest.query.get(request_id)
        return {
            "status": row.status,
            "decided_by_coach_id": row.decided_by_coach_id,
            "decided_at": row.decided_at,
        }


def _is_member(app, coach_id, club_id):
    from padel_app.models import Association_CoachClub

    with app.app_context():
        return (
            Association_CoachClub.query.filter_by(coach_id=coach_id, club_id=club_id).first()
            is not None
        )


@pytest.fixture
def world(app):
    """Club 1 with member `maria`; approved `rui` and `joao` with no club; a student."""
    academy = _make_club(app, "Padel Academy", "Lisbon")
    norte = _make_club(app, "Padel Norte", "Porto")
    other = _make_club(app, "Tennis Town", "Faro")
    maria_user, maria_coach = _make_coach(app, "maria", club_id=academy)
    rui_user, rui_coach = _make_coach(app, "rui")
    joao_user, joao_coach = _make_coach(app, "joao")
    student_user = _make_student(app, "ana")
    pending_user, pending_coach = _make_coach(app, "pendingcoach", status="pending")
    return {
        "academy": academy, "norte": norte, "other": other,
        "maria": (maria_user, maria_coach), "rui": (rui_user, rui_coach),
        "joao": (joao_user, joao_coach), "student": student_user,
        "pending": (pending_user, pending_coach),
    }


# --- Clubs are searchable by name without revealing members ---------------

def test_search_returns_matching_clubs_without_member_info(client, app, world):
    res = client.get("/api/app/clubs/search?q=padel", headers=_auth(app, world["rui"][0]))
    assert res.status_code == 200
    body = res.get_json()
    assert [c["name"] for c in body] == ["Padel Academy", "Padel Norte"]
    for club in body:
        assert set(club.keys()) == {"id", "name", "location", "logoUrl"}
    assert body[0]["location"] == "Lisbon"


def test_search_is_case_insensitive_and_needs_two_chars(client, app, world):
    headers = _auth(app, world["rui"][0])
    assert [c["name"] for c in client.get("/api/app/clubs/search?q=NORTE", headers=headers).get_json()] == ["Padel Norte"]
    assert client.get("/api/app/clubs/search?q=p", headers=headers).get_json() == []
    assert client.get("/api/app/clubs/search", headers=headers).get_json() == []


def test_search_is_closed_to_anonymous_students_and_pending_coaches(client, app, world):
    assert client.get("/api/app/clubs/search?q=padel").status_code == 401
    res = client.get("/api/app/clubs/search?q=padel", headers=_auth(app, world["student"]))
    assert res.status_code == 403
    res = client.get("/api/app/clubs/search?q=padel", headers=_auth(app, world["pending"][0]))
    assert res.status_code == 403
    assert res.get_json()["error"] == "COACH_NOT_APPROVED"


# --- Coach requests to join and a member approves -------------------------

def test_coach_requests_and_member_approves(client, app, world):
    rui_user, rui_coach = world["rui"]
    maria_user, maria_coach = world["maria"]
    academy = world["academy"]

    res = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user))
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["status"] == "pending"
    assert body["clubId"] == academy and body["clubName"] == "Padel Academy"
    assert body["coachId"] == rui_coach and body["coachName"] == "Rui"
    assert body["requestedAt"]
    request_id = body["id"]

    # Rule 6: /me reports it while pending.
    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert me["clubs"] == []
    assert me["pendingClubJoinRequest"] == {"id": request_id, "clubId": academy, "clubName": "Padel Academy"}

    # Rule 3: the member sees it listed with the requester's name.
    listed = client.get(f"/api/app/club/{academy}/join-requests", headers=_auth(app, maria_user)).get_json()
    assert [r["id"] for r in listed] == [request_id]
    assert listed[0]["coachName"] == "Rui" and listed[0]["requestedAt"]

    res = client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, maria_user))
    assert res.status_code == 200
    assert res.get_json()["status"] == "approved"
    row = _request_row(app, request_id)
    assert row["status"] == "approved"
    assert row["decided_by_coach_id"] == maria_coach
    assert row["decided_at"] is not None
    assert _is_member(app, rui_coach, academy)

    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert [c["id"] for c in me["clubs"]] == [academy]
    assert me["pendingClubJoinRequest"] is None
    # And it is gone from the member's pending list.
    assert client.get(f"/api/app/club/{academy}/join-requests", headers=_auth(app, maria_user)).get_json() == []


def test_approving_twice_is_410_and_membership_stays_single(client, app, world):
    from padel_app.models import Association_CoachClub

    rui_user, rui_coach = world["rui"]
    maria_user, _ = world["maria"]
    academy = world["academy"]
    request_id = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]
    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, maria_user)).status_code == 200
    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, maria_user)).status_code == 410
    with app.app_context():
        assert Association_CoachClub.query.filter_by(coach_id=rui_coach, club_id=academy).count() == 1


# --- Rejecting leaves no membership --------------------------------------

def test_rejecting_leaves_no_membership(client, app, world):
    rui_user, rui_coach = world["rui"]
    maria_user, maria_coach = world["maria"]
    academy = world["academy"]
    request_id = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]

    res = client.post(f"/api/app/club-join-requests/{request_id}/reject", headers=_auth(app, maria_user))
    assert res.status_code == 200
    row = _request_row(app, request_id)
    assert row["status"] == "rejected" and row["decided_by_coach_id"] == maria_coach
    assert not _is_member(app, rui_coach, academy)
    # Rejection is final for that request; a fresh one may be made.
    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert me["pendingClubJoinRequest"] is None
    assert client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).status_code == 201


# --- Non-member cannot decide ----------------------------------------------

def test_non_member_cannot_decide(client, app, world):
    rui_user, _ = world["rui"]
    joao_user, _ = world["joao"]
    academy = world["academy"]
    request_id = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]

    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, joao_user)).status_code == 403
    assert client.post(f"/api/app/club-join-requests/{request_id}/reject", headers=_auth(app, joao_user)).status_code == 403
    assert _request_row(app, request_id)["status"] == "pending"
    # The requester cannot approve themselves either.
    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, rui_user)).status_code == 403


# --- Duplicate pending request is rejected --------------------------------

def test_duplicate_pending_request_is_409(client, app, world):
    from padel_app.models import ClubJoinRequest

    rui_user, rui_coach = world["rui"]
    academy = world["academy"]
    assert client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).status_code == 201
    assert client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).status_code == 409
    with app.app_context():
        assert ClubJoinRequest.query.filter_by(coach_id=rui_coach, club_id=academy, status="pending").count() == 1


def test_member_cannot_request_their_own_club_and_unknown_club_is_404(client, app, world):
    maria_user, _ = world["maria"]
    assert client.post(f"/api/app/club/{world['academy']}/join-requests", headers=_auth(app, maria_user)).status_code == 409
    assert client.post("/api/app/club/9999/join-requests", headers=_auth(app, world["rui"][0])).status_code == 404


# --- A student never reaches the list ------------------------------------

def test_student_gets_403_not_500_on_join_request_routes(client, app, world):
    headers = _auth(app, world["student"])
    academy = world["academy"]
    assert client.get(f"/api/app/club/{academy}/join-requests", headers=headers).status_code == 403
    assert client.post(f"/api/app/club/{academy}/join-requests", headers=headers).status_code == 403
    assert client.post("/api/app/club-join-requests/1/approve", headers=headers).status_code == 403


def test_pending_coach_cannot_request_to_join(client, app, world):
    res = client.post(f"/api/app/club/{world['academy']}/join-requests", headers=_auth(app, world["pending"][0]))
    assert res.status_code == 403
    assert res.get_json()["error"] == "COACH_NOT_APPROVED"


def test_non_member_cannot_list_requests(client, app, world):
    assert client.get(f"/api/app/club/{world['academy']}/join-requests", headers=_auth(app, world["joao"][0])).status_code == 403


# --- Coach with no club gets 409, not 500 --------------------------------

def test_coach_with_pending_request_and_no_club_gets_409_no_club(client, app, world):
    """Extends test_coach_approval.test_approved_coach_without_club_gets_409_no_club
    with the pending-request state the spec criterion names."""
    rui_user, _ = world["rui"]
    assert client.post(f"/api/app/club/{world['academy']}/join-requests", headers=_auth(app, rui_user)).status_code == 201
    res = client.post("/api/app/add_player", json={"name": "X"}, headers=_auth(app, rui_user))
    assert res.status_code == 409
    assert res.get_json()["error"] == "NO_CLUB"


# --- Withdraw (rule 5) and "create my own club instead" (rule 7) -----------

def test_requester_withdraws_and_others_cannot(client, app, world):
    rui_user, _ = world["rui"]
    maria_user, _ = world["maria"]
    academy = world["academy"]
    request_id = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]

    assert client.post(f"/api/app/club-join-requests/{request_id}/withdraw", headers=_auth(app, maria_user)).status_code == 403
    res = client.post(f"/api/app/club-join-requests/{request_id}/withdraw", headers=_auth(app, rui_user))
    assert res.status_code == 200 and res.get_json()["status"] == "withdrawn"
    assert client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()["pendingClubJoinRequest"] is None
    # Decided requests are 410 for every later action.
    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, maria_user)).status_code == 410
    assert client.post(f"/api/app/club-join-requests/{request_id}/withdraw", headers=_auth(app, rui_user)).status_code == 410


def test_creating_own_club_while_pending_keeps_request_and_later_approval_adds_second_club(client, app, world):
    rui_user, rui_coach = world["rui"]
    maria_user, _ = world["maria"]
    academy = world["academy"]
    request_id = client.post(f"/api/app/club/{academy}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]

    res = client.post("/api/app/club", json={"name": "Rui Padel"}, headers=_auth(app, rui_user))
    assert res.status_code == 201
    own_club = res.get_json()["id"]
    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert [c["name"] for c in me["clubs"]] == ["Rui Padel"]
    assert me["pendingClubJoinRequest"]["id"] == request_id

    assert client.post(f"/api/app/club-join-requests/{request_id}/approve", headers=_auth(app, maria_user)).status_code == 200
    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert {c["id"] for c in me["clubs"]} == {own_club, academy}
    assert me["pendingClubJoinRequest"] is None


def test_me_reports_most_recent_pending_request(client, app, world):
    rui_user, _ = world["rui"]
    first = client.post(f"/api/app/club/{world['academy']}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]
    second = client.post(f"/api/app/club/{world['norte']}/join-requests", headers=_auth(app, rui_user)).get_json()["id"]
    assert second > first
    me = client.get("/api/auth/me", headers=_auth(app, rui_user)).get_json()
    assert me["pendingClubJoinRequest"]["clubName"] == "Padel Norte"


# --- Model / migration ------------------------------------------------------

def test_model_defaults(app, world):
    from padel_app.models import ClubJoinRequest

    with app.app_context():
        row = ClubJoinRequest(club_id=world["academy"], coach_id=world["rui"][1])
        db.session.add(row)
        db.session.commit()
        assert row.status == "pending"
        assert row.requested_at is not None
        assert row.decided_at is None and row.decided_by_coach_id is None


def test_migration_revises_the_single_head():
    import importlib.util, pathlib

    path = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions" / "c1d2e3f4a5b6_add_club_join_requests.py"
    spec = importlib.util.spec_from_file_location("mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "c1d2e3f4a5b6"
    assert mod.down_revision == "b7c8d9e0f1a2"
    src = path.read_text()
    assert "uq_club_join_request_pending" in src and "postgresql_where" in src
