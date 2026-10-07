"""PAD-519 — notifications.message-templates rule 17 (numbering unconfirmed): the
system's own class notices name the day of the month, not only the weekday.

"X entrou na lista de espera de Sábado 18h no sábado às 18:00" told a coach with a
weekly Saturday class nothing about WHICH Saturday. One formatter (`_format_when`)
writes that suffix for the waiting-list join notice, the join-request notices, the
late-cancel/late-return notices and the `{when}` of `added_to_class`; dating an
occurrence there fixes every one. A series stays undated: a recurring enrolment has
no single day.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PT_WEEKDAYS = ("segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo")
EN_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _dated(dt, locale="pt"):
    """The rule-17 phrase this test expects for an occurrence at ``dt``."""
    wd = (PT_WEEKDAYS if locale == "pt" else EN_WEEKDAYS)[dt.weekday()]
    if locale == "pt":
        return f" no dia {dt:%d/%m} ({wd}) às {dt:%H:%M}"
    return f" on {dt:%d/%m} ({wd}) at {dt:%H:%M}"


def _undated(dt, locale="pt"):
    wd = (PT_WEEKDAYS if locale == "pt" else EN_WEEKDAYS)[dt.weekday()]
    if locale == "pt":
        return f" {'no' if dt.weekday() >= 5 else 'na'} {wd} às {dt:%H:%M}"
    return f" on {wd} at {dt:%H:%M}"


def _quiet(monkeypatch):
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    monkeypatch.setattr("padel_app.services.notification_service.publish", lambda event, recipients: None)


# ── the formatter ─────────────────────────────────────────────────────────────

def test_the_formatter_dates_an_occurrence_and_not_a_series(app):
    from padel_app.services.notification_service import _format_class_when, _format_when

    saturday = datetime(2027, 4, 10, 18, 0)
    assert _format_when(saturday, "pt", dated=True) == " no dia 10/04 (sábado) às 18:00"
    assert _format_when(saturday, "en", dated=True) == " on 10/04 (Saturday) at 18:00"
    # The series form is what it always was — `na` for a weekday, `no` for the weekend.
    assert _format_when(saturday, "pt") == " no sábado às 18:00"
    assert _format_when(datetime(2027, 4, 12, 10, 0), "pt") == " na segunda-feira às 10:00"
    assert _format_when(saturday, "en") == " on Saturday at 18:00"
    assert _format_when(None, "pt", dated=True) == ""

    class _Instance:
        start_datetime = saturday

    # A class instance is always one occurrence, so its suffix is always dated.
    assert _format_class_when(_Instance(), "pt") == " no dia 10/04 (sábado) às 18:00"
    assert _format_class_when(_Instance(), "en") == " on 10/04 (Saturday) at 18:00"


# ── the waiting-list join notice (the ticket) ─────────────────────────────────

def test_a_waiting_list_join_tells_the_coach_the_day(app, monkeypatch):
    from padel_app.models import Coach, LessonInstance, Message
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation
    from padel_app.tests.test_pad358_academy_classes import _add_class, _join, _setup

    _quiet(monkeypatch)
    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Sábado 18h", max_players=2, filled=2)
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])

    with app.app_context():
        start = db.session.get(LessonInstance, full["instance_id"]).start_datetime
        conv = _get_or_create_direct_conversation(
            db.session.get(Coach, ids["coach_id"]).user_id, db.session.get(Player, ids["student_id"]).user_id
        )
        texts = [m.text for m in Message.query.filter_by(conversation_id=conv.id).all()
                 if (m.msg_metadata or {}).get("waitingListJoin")]
    assert len(texts) == 1
    assert texts[0].endswith(f"entrou na lista de espera de Sábado 18h{_dated(start)}."), texts[0]


def test_an_english_coach_reads_the_day_too(app, monkeypatch):
    from padel_app.models import Coach, LessonInstance, Message
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation
    from padel_app.tests.test_pad358_academy_classes import _add_class, _join, _setup

    _quiet(monkeypatch)
    ids = _setup(app)
    with app.app_context():
        db.session.get(Coach, ids["coach_id"]).user.language = "en"
        db.session.commit()
    full = _add_class(app, ids, days=3, title="Sábado 18h", max_players=2, filled=2)
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])

    with app.app_context():
        start = db.session.get(LessonInstance, full["instance_id"]).start_datetime
        conv = _get_or_create_direct_conversation(
            db.session.get(Coach, ids["coach_id"]).user_id, db.session.get(Player, ids["student_id"]).user_id
        )
        texts = [m.text for m in Message.query.filter_by(conversation_id=conv.id).all()
                 if (m.msg_metadata or {}).get("waitingListJoin")]
    assert texts[0].endswith(f"joined the waiting list for Sábado 18h{_dated(start, 'en')}."), texts[0]


# ── the join-request notices share the formatter ──────────────────────────────

def test_a_refused_join_request_names_the_day(app, monkeypatch):
    from padel_app.models import LessonInstance
    from padel_app.tests.test_pad131_join_requests import (
        LEVEL_SAME, _config, _decide, _messages_for, _request, _student,
    )
    from padel_app.tests.test_pad128_eligibility import _seed

    _quiet(monkeypatch)
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "carla")
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=False) == "rejected"

    with app.app_context():
        start = db.session.get(LessonInstance, ids["instance_id"]).start_datetime
    texts = [t for _, t, _ in _messages_for(app, ids, pid)]
    asked = [t for t in texts if t.startswith("carla pediu para entrar em") or " pediu para entrar em " in t]
    refused = [t for t in texts if t.startswith("O teu pedido para entrar em")]
    assert len(asked) == 1 and len(refused) == 1, texts
    assert asked[0].endswith(f"{_dated(start)}."), asked[0]
    assert refused[0].endswith(f"{_dated(start)} não foi aceite."), refused[0]


# ── `{when}` in added_to_class: dated for one occurrence, not for a series ────

def test_added_to_a_series_stays_undated_but_an_occurrence_is_dated(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import create_lesson_helper, edit_lesson_helper, enrol
    from padel_app.tests.test_pad259_readers import _second_student
    from padel_app.tests.test_pad330_the_student_is_told import _added_messages, _club, _seed_coach_and_student
    from padel_app.tests.test_notification_reminder_flow import PATCHES, _seed_instance

    ids = _seed_coach_and_student(app)
    club_id = _club(app)
    with app.app_context():
        carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
        start = datetime.utcnow().replace(minute=0, second=0, microsecond=0) + timedelta(days=4)
        with patch(PATCHES[0]), patch(PATCHES[1]), patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            lesson = create_lesson_helper({
                "title": "Segunda 10h", "type": "academy", "status": "active",
                "max_players": 4, "color": "#000", "club": club_id,
                "start_datetime": start, "end_datetime": start + timedelta(hours=1),
                "coach": ids["coach_id"],
            })
            edit_lesson_helper({"add_player_ids": [carol], "date": start.date().isoformat()}, lesson)
            series_start = lesson.start_datetime

    series_text = _added_messages(app, carol_uid)[0].text
    assert f"adicionei-te a Segunda 10h{_undated(series_start)}." in series_text, series_text
    assert "no dia" not in series_text, series_text

    with app.app_context():
        dave, dave_uid = _second_student(app, ids["coach_id"], "dave")
        iid = _seed_instance(app, ids["coach_id"], ids["student_id"])
        instance = db.session.get(LessonInstance, iid)
        occurrence_start = instance.start_datetime
        with patch(PATCHES[0]), patch(PATCHES[1]), patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            enrol(dave, instance, "coach")

    occurrence_text = _added_messages(app, dave_uid)[0].text
    assert f"adicionei-te a Test Class{_dated(occurrence_start)}." in occurrence_text, occurrence_text
