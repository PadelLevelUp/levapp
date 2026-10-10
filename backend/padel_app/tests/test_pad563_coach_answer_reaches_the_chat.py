"""PAD-563 — notifications.invitations rule 9 (owner, 2026-10-09): the coach's recorded answer
reaches the student's chat, and a student's later answer is refused by the server.

Before: `coach_respond_to_notification` stamped the invitation (`answer`, `answered_by`) and never
touched the invite message, so both shells kept "Aguardar resposta" with live buttons until the
student tapped. Cells marked OLD-RED fail on #576's code. The refusals (rules 17/18) and the
withdrawal's live bubble (rule 19, test_pad548) were already true; they are pinned here, not built.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, _seed
from padel_app.tests.test_pad497_a_no_is_final import _answer, _instance, _io
from padel_app.tests.test_pad499_publish_after_commit import trail  # noqa: F401 — fixture
from padel_app.tests.test_pad548_coach_withdraws_invitation import _event_of


def _bubble(event):
    from padel_app.models import Message

    return Message.query.get(event.message_id).msg_metadata


def _one_invitation(instance_id, coach_id, player_id):
    from padel_app.services.notification_service import trigger_invitations

    trigger_invitations(_instance(instance_id), coach_id, now=NOW)
    event = _event_of(instance_id, player_id)
    assert event.message_id and not _bubble(event).get("responded")
    return event


# ── rule 9: the bubble says the coach answered, in the one commit, published after it ──────────

def test_a_coach_recorded_no_marks_the_bubble_and_publishes_after_the_commit(app, monkeypatch, trail):
    """OLD-RED: the bubble stayed unanswered and nothing was published."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=1)
            event = _one_invitation(instance_id, coach_id, a)
        message_id = event.message_id
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        trail.clear()
        assert coach_respond_to_notification(event.id, "no", coach_id, now=NOW + timedelta(minutes=1)) == {"action": "declined"}
        assert _bubble(event) == {**_bubble(event), "responded": True, "response": "no", "answeredBy": "coach"}
        assert (event.answer, event.answered_by, event.status) == ("no", "coach", "expired")
        assert event.vacancy is not None and event.vacancy.last_activity_at is not None  # same commit

    assert trail.count("commit") == 1, f"the coach's no must be ONE commit: {trail}"
    i_commit = trail.index("commit")
    assert f"publish:message_edited:{message_id}" in trail[i_commit + 1:], f"the bubble edit goes out after the commit: {trail}"
    assert not any(t.startswith("publish:") for t in trail[:i_commit]), f"nothing before the commit: {trail}"


def test_a_coach_recorded_yes_marks_the_winners_bubble_in_the_one_commit(app, monkeypatch, trail):
    """OLD-RED: `_close_vacancy` retired the OTHER invitations' bubbles; the winner's own stayed
    unanswered. Now it reads yes-by-coach, written with the close and the enrolment."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
            event = _one_invitation(instance_id, coach_id, a)
            other = _event_of(instance_id, b)
        winner_message_id, other_message_id = event.message_id, other.message_id
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        trail.clear()
        assert coach_respond_to_notification(event.id, "yes", coach_id, now=NOW + timedelta(minutes=1)) == {"action": "confirmed"}
        assert _bubble(event) == {**_bubble(event), "responded": True, "response": "yes", "answeredBy": "coach"}
        assert _bubble(other) == {**_bubble(other), "responded": True, "response": "expired"}
        assert (event.answer, event.answered_by, event.status) == ("yes", "coach", "confirmed")
        assert a in _instance(instance_id).enrolled_player_ids

    # ONE commit carries the answer, the close and the enrolment (PAD-499), and the bubble edits
    # go out after it, never before. PAD-596: the two `save()` calls that used to follow it
    # (two empty commits) are gone, so the count is pinned as the coach's "no" pins its own.
    assert trail.count("commit") == 1, f"the coach's yes must be ONE commit: {trail}"
    i_commit = trail.index("commit")
    assert trail[:i_commit] == ["close"], f"nothing is published before the commit that records the yes: {trail}"
    after = trail[i_commit + 1:]
    assert f"publish:message_edited:{winner_message_id}" in after, f"the winner's bubble edit goes out with the commit: {trail}"
    assert f"publish:message_edited:{other_message_id}" in after, trail


def test_a_manual_invitations_recorded_answer_reaches_the_chat_too(app, monkeypatch):
    """Criterion "A manual invitation's recorded answer reaches the chat too": no vacancy to lock,
    the invitation row's own lock (rule 17)."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification, send_manual_notifications
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2)
            send_manual_notifications(instance_id, [a, b], coach_id)
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        for player_id, action, response in ((a, "yes", "yes"), (b, "no", "no")):
            event = _event_of(instance_id, player_id)
            assert event.vacancy_id is None and event.message_id
            coach_respond_to_notification(event.id, action, coach_id, now=NOW + timedelta(minutes=1))
            assert _bubble(event) == {**_bubble(event), "responded": True, "response": response, "answeredBy": "coach"}
            assert NotificationEvent.query.get(event.id).answered_by == "coach"


def test_a_students_own_answer_says_student(app, monkeypatch):
    """Rule 9: the student's own no/yes writes `answeredBy: "student"` (the shells show no "by the
    coach" line)."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2)
            trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        with _io():
            _answer(instance_id, a, "no", NOW + timedelta(minutes=1))
            _answer(instance_id, b, "yes", NOW + timedelta(minutes=1))
        assert _bubble(_event_of(instance_id, a)) == {**_bubble(_event_of(instance_id, a)), "response": "no", "answeredBy": "student"}
        assert _bubble(_event_of(instance_id, b)) == {**_bubble(_event_of(instance_id, b)), "response": "yes", "answeredBy": "student"}


# ── rules 17/18: a student's later answer is refused (already true; pinned, not built) ─────────

def test_a_students_yes_after_the_coachs_no_is_refused(app, monkeypatch):
    """Green before and after (rule 18): `declined`, nobody enrolled, the bubble keeps no-by-coach."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
            event = _one_invitation(instance_id, coach_id, a)
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        coach_respond_to_notification(event.id, "no", coach_id, now=NOW + timedelta(minutes=1))
        with _io():
            assert _answer(instance_id, a, "yes", NOW + timedelta(minutes=2)) == {"action": "declined"}
        assert a not in _instance(instance_id).enrolled_player_ids
        assert _bubble(event) == {**_bubble(event), "response": "no", "answeredBy": "coach"}


def test_a_students_no_after_the_coachs_yes_is_refused(app, monkeypatch):
    """Green before and after (rule 17): `confirmed`, the student keeps the spot, yes-by-coach stays."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        with _io():
            instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=1)
            event = _one_invitation(instance_id, coach_id, a)
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        coach_respond_to_notification(event.id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        with _io():
            assert _answer(instance_id, a, "no", NOW + timedelta(minutes=2)) == {"action": "confirmed"}
            assert _answer(instance_id, a, "yes", NOW + timedelta(minutes=3)) == {"action": "confirmed"}
        assert a in _instance(instance_id).enrolled_player_ids
        assert _bubble(event) == {**_bubble(event), "response": "yes", "answeredBy": "coach"}
