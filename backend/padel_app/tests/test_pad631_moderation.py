"""PAD-631 — admin.moderation: staff list message reports, read them in context, and act on them
(dismiss / delete the message / disable the author), each audited; and read the deletion audit.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role

T0 = datetime(2026, 10, 1, 10, 0, 0)


@pytest.fixture
def staff(app):
    return {
        "operator": bearer(admin_token(app, make_role(app, "op631@levapp.app", "operator"))),
        "support": bearer(admin_token(app, make_role(app, "sup631@levapp.app", "support"))),
    }


@pytest.fixture
def published(monkeypatch):
    from padel_app.services import messaging_service

    events = []
    monkeypatch.setattr(messaging_service, "publish", lambda event, recipients: events.append((event, sorted(recipients))))
    return events


def _thread(app, n=6, reported_index=3, reason="abuso"):
    """A coach↔student conversation of `n` messages; the student reports message `reported_index`."""
    from padel_app.models import Message, MessageReport, User
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation

    with app.app_context():
        coach = User(name="Carla Coach", username="carla631", password="x", status="active")
        student = User(name="Sara Aluna", username="sara631", password="x", status="active")
        db.session.add_all([coach, student])
        db.session.flush()
        conv = Conversation(is_group=False, participant_key=Conversation.build_participant_key([coach.id, student.id]))
        db.session.add(conv)
        db.session.flush()
        for uid in (coach.id, student.id):
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))
        ids = []
        for i in range(n):
            m = Message(text=f"msg {i}", sent_at=T0 + timedelta(minutes=i), conversation_id=conv.id,
                        sender_id=coach.id if i % 2 else student.id)
            db.session.add(m)
            db.session.flush()
            ids.append(m.id)
        report = MessageReport(reporter_id=student.id, message_id=ids[reported_index], reason=reason)
        db.session.add(report)
        db.session.commit()
        return {"report": report.id, "messages": ids, "conv": conv.id, "coach": coach.id, "student": student.id}


def _report(app, rid):
    from padel_app.models import MessageReport

    with app.app_context():
        r = MessageReport.query.get(rid)
        return {"status": r.status, "outcome": r.outcome, "closed_by": r.closed_by,
                "closed": r.closed_at is not None}


# ── rules 1–2: the list ─────────────────────────────────────────────────────────

def test_a_report_is_listed_open_with_its_message_and_people(client, app, staff):
    t = _thread(app)
    res = client.get("/admin/api/reports?status=open", headers=staff["support"])
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["total"] == 1 and body["hasMore"] is False
    [row] = body["items"]
    assert row["id"] == t["report"] and row["status"] == "open" and row["outcome"] is None
    assert row["reason"] == "abuso"
    assert row["message"] == {"id": t["messages"][3], "text": "msg 3", "deleted": False}
    assert row["author"]["id"] == t["coach"] and row["reporter"]["id"] == t["student"]
    assert row["conversationId"] == t["conv"]
    assert client.get("/admin/api/reports?status=closed", headers=staff["support"]).get_json()["items"] == []


def test_the_summary_counts_open_reports(client, app, staff):
    _thread(app)
    assert client.get("/admin/api/reports/summary", headers=staff["support"]).get_json() == {"open": 1}


# ── rule 3: the detail ──────────────────────────────────────────────────────────

def test_the_detail_shows_two_before_and_two_after_and_the_participants(client, app, staff):
    t = _thread(app)
    res = client.get(f"/admin/api/reports/{t['report']}", headers=staff["support"])
    assert res.status_code == 200, res.get_json()
    ctx = res.get_json()["context"]
    assert [m["id"] for m in ctx] == t["messages"][1:6]
    assert [m["reported"] for m in ctx] == [False, False, True, False, False]
    people = {p["id"] for p in res.get_json()["participants"]}
    assert people == {t["coach"], t["student"]}


def test_an_unknown_report_is_404(client, app, staff):
    assert client.get("/admin/api/reports/99999", headers=staff["support"]).status_code == 404


# ── rule 4: acting ──────────────────────────────────────────────────────────────

def test_dismiss_closes_the_report_and_is_audited(client, app, staff):
    t = _thread(app)
    res = client.post(f"/admin/api/reports/{t['report']}/dismiss", json={}, headers=staff["operator"])
    assert res.status_code == 200, res.get_json()
    assert _report(app, t["report"]) == {"status": "closed", "outcome": "dismissed",
                                         "closed_by": "op631@levapp.app", "closed": True}
    [row] = audit_rows(app, "report.dismiss")
    assert row["targetType"] == "message_report" and row["targetId"] == str(t["report"])


def test_delete_message_soft_deletes_it_and_tells_the_participants(client, app, staff, published):
    from padel_app.models import Message

    t = _thread(app)
    res = client.post(f"/admin/api/reports/{t['report']}/delete-message", json={}, headers=staff["operator"])
    assert res.status_code == 200, res.get_json()
    with app.app_context():
        assert Message.query.get(t["messages"][3]).is_deleted is True
    assert _report(app, t["report"])["outcome"] == "message_deleted"
    assert len(audit_rows(app, "report.delete_message")) == 1
    [(event, recipients)] = published
    assert event["type"] == "message_deleted" and event["payload"]["id"] == t["messages"][3]
    assert recipients == sorted([t["coach"], t["student"]])


def test_disable_author_disables_them_and_needs_no_body(client, app, staff):
    from padel_app.models import User

    t = _thread(app)
    res = client.post(f"/admin/api/reports/{t['report']}/disable-author", json={"note": "ameaças"},
                      headers=staff["operator"])
    assert res.status_code == 200, res.get_json()
    with app.app_context():
        assert User.query.get(t["coach"]).status == "disabled"
        # The reporter is never touched: only the reported message's author.
        assert User.query.get(t["student"]).status == "active"
    assert _report(app, t["report"])["outcome"] == "author_disabled"
    [row] = audit_rows(app, "report.disable_author")
    assert row["targetType"] == "message_report"


@pytest.mark.parametrize("action", ["dismiss", "delete-message", "disable-author"])
def test_a_closed_report_is_409_and_nothing_changes(client, app, staff, action, published):
    t = _thread(app)
    assert client.post(f"/admin/api/reports/{t['report']}/dismiss", json={}, headers=staff["operator"]).status_code == 200
    res = client.post(f"/admin/api/reports/{t['report']}/{action}", json={}, headers=staff["operator"])
    assert res.status_code == 409
    assert res.get_json()["code"] == "REPORT_CLOSED"
    assert _report(app, t["report"])["outcome"] == "dismissed"
    assert published == []


@pytest.mark.parametrize("action", ["dismiss", "delete-message", "disable-author"])
def test_support_cannot_act(client, app, staff, action):
    t = _thread(app)
    res = client.post(f"/admin/api/reports/{t['report']}/{action}", json={}, headers=staff["support"])
    assert res.status_code == 403
    assert _report(app, t["report"])["status"] == "open"


def test_without_a_token_nothing_is_readable(client, app):
    assert client.get("/admin/api/reports").status_code in (401, 404)


# ── rule 6: deletion audit ──────────────────────────────────────────────────────

def test_the_deletion_audit_is_listed_and_filtered(client, app, staff):
    from padel_app.models import User
    from padel_app.models.deletion_audit import DeletionAudit

    with app.app_context():
        actor = User(name="Zé Admin", username="ze631", password="x", status="active")
        db.session.add(actor)
        db.session.flush()
        db.session.add(DeletionAudit(actor_user_id=actor.id, entity="club", entity_id=7, action="delete",
                                     label="Clube Norte", details={"courts": 3}))
        db.session.add(DeletionAudit(actor_user_id=None, entity="lesson", entity_id=9, action="delete"))
        db.session.commit()
    res = client.get("/admin/api/deletion-audits?entity=club", headers=staff["support"])
    assert res.status_code == 200, res.get_json()
    [row] = res.get_json()["items"]
    assert (row["entity"], row["entityId"], row["action"], row["label"]) == ("club", 7, "delete", "Clube Norte")
    assert row["actor"]["name"] == "Zé Admin" and row["details"] == {"courts": 3}
    assert len(client.get("/admin/api/deletion-audits", headers=staff["support"]).get_json()["items"]) == 2


# ── review round ─────────────────────────────────────────────────────────────

def test_a_refused_action_still_audits_the_report(client, app, staff):
    from padel_app.tests.admin_helpers import audit_rows as rows

    t = _thread(app)
    client.post(f"/admin/api/reports/{t['report']}/dismiss", json={}, headers=staff["operator"])
    assert client.post(f"/admin/api/reports/{t['report']}/delete-message", json={}, headers=staff["operator"]).status_code == 409
    [denied] = [r for r in rows(app, "report.delete_message")]
    assert denied["outcome"] != "ok"
    assert (denied["targetType"], denied["targetId"]) == ("message_report", str(t["report"]))


def test_a_disable_refused_by_the_users_service_is_a_4xx_not_a_500(client, app, staff, monkeypatch):
    from padel_app.services.admin import users_service

    def refuse(user_id, reason):
        raise users_service.ReasonRequired()

    monkeypatch.setattr(users_service, "disable", refuse)
    t = _thread(app)
    res = client.post(f"/admin/api/reports/{t['report']}/disable-author", json={}, headers=staff["operator"])
    assert 400 <= res.status_code < 500, res.get_json()
    assert _report(app, t["report"])["status"] == "open"


def test_an_already_deleted_message_closes_the_report_without_a_second_event(client, app, staff, published):
    from padel_app.models import Message

    t = _thread(app)
    with app.app_context():
        Message.query.get(t["messages"][3]).is_deleted = True
        db.session.commit()
    res = client.post(f"/admin/api/reports/{t['report']}/delete-message", json={}, headers=staff["operator"])
    assert res.status_code == 200
    assert _report(app, t["report"])["outcome"] == "message_deleted"
    assert published == []


def test_the_context_names_each_sender_even_one_who_left(client, app, staff):
    from padel_app.models.conversation_participants import ConversationParticipant

    t = _thread(app)
    with app.app_context():
        ConversationParticipant.query.filter_by(conversation_id=t["conv"], user_id=t["coach"]).delete()
        db.session.commit()
    ctx = client.get(f"/admin/api/reports/{t['report']}", headers=staff["support"]).get_json()["context"]
    names = {m["senderName"] for m in ctx}
    assert names == {"Carla Coach", "Sara Aluna"}


# --- admin.moderation rule 8: a new report emails ADMIN_NOTIFY_EMAIL, once per burst ---------------


@pytest.fixture
def mail(app, monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email",
                        lambda subject, recipients, body=None, html=None: sent.append((subject, recipients, body)))
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    app.config["ADMIN_CONSOLE_URL"] = "https://admin.levapp.app"
    return sent


def _quiet_thread(app):
    """A thread whose own report is an hour old, outside the quiet window."""
    from padel_app.models import MessageReport

    t = _thread(app)
    with app.app_context():
        r = db.session.get(MessageReport, t["report"])
        r.created_at = r.created_at - timedelta(hours=1)
        db.session.commit()
    return t


def _report_now(app, t, index=2, reason="insultos graves"):
    from padel_app.services.messaging_service import report_message_service

    with app.app_context():
        return report_message_service(t["student"], t["messages"][index], reason).id


def test_a_new_report_emails_the_admin_with_a_console_link_and_no_message_text(app, mail):
    t = _quiet_thread(app)
    _report_now(app, t)
    assert len(mail) == 1
    subject, recipients, body = mail[0]
    assert recipients == ["admin@levapp.app"]
    assert "https://admin.levapp.app/reports" in body
    assert "2" in body  # the open count: the thread's own report plus this one
    for private in ("msg 2", "insultos", "Sara", "Carla", "sara631", "carla631"):
        assert private not in subject + body


def test_a_burst_of_reports_sends_one_email(app, mail):
    t = _quiet_thread(app)
    for i in (1, 2, 4, 5):
        _report_now(app, t, index=i)
    assert len(mail) == 1


def test_a_report_after_the_quiet_window_emails_again(app, mail):
    from padel_app.models import MessageReport

    t = _quiet_thread(app)
    first = _report_now(app, t, index=1)
    with app.app_context():
        r = db.session.get(MessageReport, first)
        r.created_at = r.created_at - timedelta(minutes=16)
        db.session.commit()
    _report_now(app, t, index=2)
    assert len(mail) == 2


def test_no_email_without_admin_notify_email(app, mail):
    app.config["ADMIN_NOTIFY_EMAIL"] = None
    t = _quiet_thread(app)
    _report_now(app, t)
    assert mail == []


def test_a_failing_mailer_never_fails_the_report(app, monkeypatch):
    from padel_app.models import MessageReport
    from padel_app.tools import email_tools

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    t = _quiet_thread(app)
    rid = _report_now(app, t)
    with app.app_context():
        assert db.session.get(MessageReport, rid) is not None
