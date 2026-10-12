"""PAD-639 × admin.moderation: the console shows what was reported, even after the message is
erased (messaging.messages rule 3, block-and-report rule 4a). The reported message reads the
report's `message_text`; a report filed before PAD-639's backfill (no copy) falls back to the
message's own text; the surrounding messages always read their own text.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role
from padel_app.tests.test_pad631_moderation import _thread


@pytest.fixture
def staff(app):
    return {"operator": bearer(admin_token(app, make_role(app, "op639@levapp.app", "operator"))),
            "support": bearer(admin_token(app, make_role(app, "sup639@levapp.app", "support")))}


@pytest.fixture(autouse=True)
def _no_publish(monkeypatch):
    from padel_app.services import messaging_service

    monkeypatch.setattr(messaging_service, "publish", lambda *a, **k: None)


def _filed_through_the_app(app, t):
    """Re-file the report the way the app does, so it carries PAD-639's copy of the text."""
    from padel_app.models import MessageReport
    from padel_app.services.messaging_service import report_message_service

    with app.app_context():
        MessageReport.query.filter_by(id=t["report"]).delete()
        report = report_message_service(t["student"], t["messages"][3], reason="abuso")
        db.session.commit()
        return report.id


def _erase(app, message_id):
    from padel_app.models import Message
    from padel_app.services.messaging_service import soft_delete_message

    with app.app_context():
        soft_delete_message(db.session.get(Message, message_id))
        db.session.commit()


def _shown(client, staff, rid):
    row = next(r for r in client.get("/admin/api/reports?status=open", headers=staff["support"]).get_json()["items"]
               if r["id"] == rid)
    detail = client.get(f"/admin/api/reports/{rid}", headers=staff["support"]).get_json()
    return row, detail


def test_the_console_shows_the_reported_text_after_the_author_deletes_it(client, app, staff):
    t = _thread(app)
    rid = _filed_through_the_app(app, t)
    _erase(app, t["messages"][3])

    row, detail = _shown(client, staff, rid)
    assert row["message"] == {"id": t["messages"][3], "text": "msg 3", "deleted": True}
    reported = next(m for m in detail["context"] if m["reported"])
    assert (reported["text"], reported["deleted"]) == ("msg 3", True)
    # The surrounding messages read their own text.
    assert [m["text"] for m in detail["context"] if not m["reported"]] == ["msg 1", "msg 2", "msg 4", "msg 5"]


def test_the_console_still_shows_it_after_its_own_delete_action(client, app, staff):
    t = _thread(app)
    rid = _filed_through_the_app(app, t)
    res = client.post(f"/admin/api/reports/{rid}/delete-message", json={}, headers=staff["operator"])
    assert res.status_code == 200, res.get_json()

    detail = client.get(f"/admin/api/reports/{rid}", headers=staff["support"]).get_json()
    assert detail["message"] == {"id": t["messages"][3], "text": "msg 3", "deleted": True}


def test_a_report_without_a_copy_falls_back_to_the_message_text(client, app, staff):
    """A report filed before the backfill carries no copy: the live message's text is shown."""
    t = _thread(app)  # D's helper writes the report row directly, with no message_text
    row, _ = _shown(client, staff, t["report"])
    assert row["message"]["text"] == "msg 3"
