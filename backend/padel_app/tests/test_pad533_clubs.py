"""admin.clubs-and-switches rules 1–3 (PAD-533): clubs, courts and coach↔club links, for staff."""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role


@pytest.fixture
def world(app):
    """Club Padel Norte with courts Court 1, Court 2; a class on Court 2; coach maria in club A only."""
    from padel_app.models import (
        Association_CoachClub, Association_CoachLesson, Club, Coach, Court, Lesson, User,
    )

    with app.app_context():
        norte = Club(name="Padel Norte")
        a = Club(name="Club A")
        b = Club(name="Club B")
        db.session.add_all([norte, a, b]); db.session.flush()
        c1 = Court(club_id=norte.id, name="Court 1", position=0)
        c2 = Court(club_id=norte.id, name="Court 2", position=1)
        db.session.add_all([c1, c2]); db.session.flush()
        user = User(name="Maria", username="maria533", email="maria533@example.com", password="x", status="active")
        db.session.add(user); db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach); db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=a.id,
                                             created_at=datetime(2026, 1, 1)))
        when = datetime(2026, 11, 2, 10, 0)
        on_c2 = Lesson(title="On court 2", type="academy", club_id=norte.id, court_id=c2.id,
                       start_datetime=when, end_datetime=when + timedelta(hours=1), max_players=4)
        in_a = Lesson(title="Maria in A", type="academy", club_id=a.id,
                      start_datetime=when, end_datetime=when + timedelta(hours=1), max_players=4)
        db.session.add_all([on_c2, in_a]); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=in_a.id))
        db.session.commit()
        ids = {"norte": norte.id, "a": a.id, "b": b.id, "c1": c1.id, "c2": c2.id,
               "coach": coach.id, "on_c2": on_c2.id, "in_a": in_a.id}
    ids["operator"] = bearer(admin_token(app, make_role(app, "op533@levapp.app", "operator")))
    ids["support"] = bearer(admin_token(app, make_role(app, "sup533@levapp.app", "support")))
    return ids


def test_staff_edit_a_club_and_its_courts_without_being_a_member(app, client, world):
    op = world["operator"]
    r = client.patch(f"/admin/api/clubs/{world['norte']}", headers=op, json={"name": "Padel Norte Porto"})
    assert r.status_code == 200 and r.get_json()["name"] == "Padel Norte Porto"
    r = client.post(f"/admin/api/clubs/{world['norte']}/courts", headers=op, json={"name": "Court 3"})
    assert r.status_code == 201
    c3 = r.get_json()["id"]
    assert client.delete(f"/admin/api/courts/{world['c2']}", headers=op).status_code == 200
    r = client.put(f"/admin/api/clubs/{world['norte']}/courts/order", headers=op, json={"ids": [c3, world["c1"]]})
    assert r.status_code == 200 and [c["name"] for c in r.get_json()] == ["Court 3", "Court 1"]

    from padel_app.models import Lesson

    with app.app_context():
        assert Lesson.query.get(world["on_c2"]).court_id is None
    detail = client.get(f"/admin/api/clubs/{world['norte']}", headers=world["support"]).get_json()
    assert [c["name"] for c in detail["courtsList"]] == ["Court 3", "Court 1"]
    actions = [(row["action"], row["outcome"]) for row in audit_rows(app) if row["action"].startswith(("club.", "court."))]
    assert actions == [("club.edit", "ok"), ("court.create", "ok"), ("court.delete", "ok"), ("court.reorder", "ok")]
    edit = audit_rows(app, "club.edit")[0]
    assert edit["before"]["name"] == "Padel Norte" and edit["after"]["name"] == "Padel Norte Porto"


def test_court_validation_matches_the_coach_routes(app, client, world):
    r = client.post(f"/admin/api/clubs/{world['norte']}/courts", headers=world["operator"], json={"name": "court 1"})
    assert r.status_code == 400 and r.get_json()["code"] == "invalid_court"
    rows = audit_rows(app, "court.create")
    assert [row["outcome"] for row in rows] == ["error"]
    from padel_app.models import Court

    with app.app_context():
        assert Court.query.filter_by(club_id=world["norte"]).count() == 2


def test_staff_link_and_unlink_a_coach(app, client, world):
    op = world["operator"]
    r = client.post(f"/admin/api/clubs/{world['b']}/coaches", headers=op, json={"coachId": world["coach"]})
    assert r.status_code == 200 and r.get_json()["currentClubId"] == world["b"]
    again = client.post(f"/admin/api/clubs/{world['b']}/coaches", headers=op, json={"coachId": world["coach"]})
    assert again.status_code == 200 and again.get_json()["changed"] is False
    r = client.delete(f"/admin/api/clubs/{world['a']}/coaches/{world['coach']}", headers=op)
    assert r.status_code == 200 and "warning" not in r.get_json()
    r = client.delete(f"/admin/api/clubs/{world['b']}/coaches/{world['coach']}", headers=op)
    assert r.get_json()["warning"] == "COACH_HAS_NO_CLUB"

    from padel_app.models import Lesson

    with app.app_context():
        lesson = Lesson.query.get(world["in_a"])
        assert lesson is not None and lesson.club_id == world["a"]
    assert [row["action"] for row in audit_rows(app) if row["action"].startswith("club.coach")] == [
        "club.coach_link", "club.coach_link", "club.coach_unlink", "club.coach_unlink"]


def test_support_reads_but_cannot_write(app, client, world):
    sup = world["support"]
    listing = client.get("/admin/api/clubs?q=norte", headers=sup)
    assert listing.status_code == 200
    row = listing.get_json()["items"][0]
    assert (row["name"], row["courts"], row["lessons"], row["coaches"]) == ("Padel Norte", 2, 1, 0)
    assert client.patch(f"/admin/api/clubs/{world['norte']}", headers=sup, json={"name": "x"}).status_code == 403
    assert client.post(f"/admin/api/clubs/{world['b']}/coaches", headers=sup, json={"coachId": world["coach"]}).status_code == 403


def test_a_club_name_is_validated(client, world):
    r = client.patch(f"/admin/api/clubs/{world['norte']}", headers=world["operator"], json={"name": "   "})
    assert r.status_code == 400 and r.get_json()["code"] == "invalid_club"


def test_a_court_write_and_its_audit_row_commit_together(app, client, world, monkeypatch):
    """admin.foundation rule 8 on the PAD-533 path: the court service no longer commits on its own
    (commit=False), so when the audit row cannot be written the court is not created either."""
    from padel_app.utils import admin_auth

    def broken(ctx, outcome):
        raise RuntimeError("audit store down")

    monkeypatch.setattr(admin_auth, "_record", broken)
    with pytest.raises(RuntimeError):
        client.post(f"/admin/api/clubs/{world['norte']}/courts", headers=world["operator"], json={"name": "Court 9"})
    from padel_app.models import Court

    with app.app_context():
        assert Court.query.filter_by(club_id=world["norte"], name="Court 9").count() == 0


def test_deleting_a_court_clears_it_on_the_loaded_classes_in_the_same_transaction(app, world):
    """clubs.courts rule 4, court_service.delete_court's explicit nulling (#585 review). The FK's
    ON DELETE SET NULL clears the rows in the database, but a class already loaded in the session
    would still show the deleted court until the session expires — the admin path flushes and its
    audit snapshot reads in that same transaction. The explicit nulling is what keeps them right."""
    from padel_app.models import Court, Lesson, LessonInstance
    from padel_app.services.court_service import delete_court

    with app.app_context():
        lesson = db.session.get(Lesson, world["on_c2"])
        instance = LessonInstance(lesson_id=lesson.id, start_datetime=lesson.start_datetime,
                                  end_datetime=lesson.end_datetime, max_players=4, court_id=world["c2"])
        db.session.add(instance); db.session.flush()
        assert lesson.court_id == world["c2"] and instance.court_id == world["c2"]
        delete_court(db.session.get(Court, world["c2"]), commit=False)
        assert lesson.court_id is None          # no expire, no reload: the loaded objects themselves
        assert instance.court_id is None
        db.session.rollback()
