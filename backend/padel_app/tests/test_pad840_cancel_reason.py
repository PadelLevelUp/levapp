"""PAD-840 — a cancellation can carry the coach's reason (classes.delete rules 9-12 and 14;
notifications.message-templates rules 25-26).

The reason is optional, at most 200 characters, and in the students' message only when the coach sends
it; unsent or empty, its sentence goes whole. It is kept on the class when the class survives the removal,
and its own coach reads it back.
"""
import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT
from padel_app.sql_db import db
from padel_app.tests.test_pad430_template_placeholders import PATCHES

START = datetime(2027, 3, 9, 19, 0)  # a Tuesday, far ahead
RULE = json.dumps({"frequency": "weekly", "daysOfWeek": [2]})
BEFORE_PT = "Olá {name}, a tua aula de {weekday} às {time} foi cancelada. Pedimos desculpa pelo incómodo!"
BEFORE_EN = "Hi {name}, your class on {weekday} at {time} has been cancelled. Sorry for the inconvenience!"
SORRY = "Pedimos desculpa pelo incómodo!"


def _seed(app, *, names=("Bruno Reis", "Ana Silva"), recurring=True, language="pt", username="p840"):
    """A coach and a class on Tuesdays at 19:00 (or a one-off) with these students on its roster."""
    from padel_app.models import Coach, Player, User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        coach_user = User(name="Rui Coach", username=username, email=f"{username}@t.test", password="x", status="active")
        coach_user.language = language
        db.session.add(coach_user)
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        club = Club(name="P840", description="", location="Porto")
        db.session.add_all([coach, club])
        db.session.flush()
        lesson = Lesson(title="Terça", start_datetime=START, end_datetime=START + timedelta(hours=1),
                        is_recurring=recurring, recurrence_rule=RULE if recurring else None, type="academy",
                        max_players=4, status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        for n, name in enumerate(names):
            user = User(name=name, username=f"{username}-s{n}", email=f"{username}-s{n}@t.test", password="x",
                        status="active")
            db.session.add(user)
            db.session.flush()
            player = Player(user_id=user.id)
            db.session.add(player)
            db.session.flush()
            db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson.id))
        db.session.commit()
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(coach_user.id))}"}
        return {"coach_id": coach.id, "lesson_id": lesson.id, "headers": headers}


def _body(ids, week=0, scope="single", **fields):
    date = (START + timedelta(weeks=week)).date().isoformat()
    return {"event": {"model": "Lesson", "originalId": ids["lesson_id"], "date": date}, "scope": scope, **fields}


def _remove(client, ids, week=0, scope="single", **fields):
    with patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        return client.post("/api/app/remove_class", json=_body(ids, week, scope, **fields), headers=ids["headers"])


def _preview(client, ids, **fields):
    resp = client.post("/api/app/class_cancellation_preview", json=_body(ids, **fields), headers=ids["headers"])
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()


def _messages(app):
    from padel_app.models.messages import Message

    with app.app_context():
        rows = [m for m in Message.query.order_by(Message.id) if (m.msg_metadata or {}).get("classCancellation")]
        return [(m.text, m.msg_metadata) for m in rows]


def _kept(app, ids):
    from padel_app.models.lessons import Lesson

    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        return None if lesson is None else lesson.cancellation_reasons


def _template(app, ids, text):
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        config = get_or_create_config(ids["coach_id"])
        config.message_templates = {"class_cancelled": text}
        db.session.commit()


def _format(template, **values):
    from padel_app.services.message_text import _format_template

    return _format_template(template, name="Ana", weekday="quarta-feira", time="19:00", **values)


# --- the message --------------------------------------------------------------------------------

@pytest.mark.criterion("CLASSES-DELETE-10")
def test_a_sent_reason_is_in_every_message(app, client):
    ids = _seed(app)
    resp = _remove(client, ids, reason="  Chuva forte ", sendReason=True)
    assert resp.status_code == 200 and resp.get_json() == {"status": "single_removed"}
    messages = _messages(app)
    assert len(messages) == 2
    for text, metadata in messages:
        assert "Motivo indicado pelo professor: Chuva forte." in text
        assert metadata["cancelReason"] == "Chuva forte"


@pytest.mark.criterion("CLASSES-DELETE-10")
def test_a_reason_is_sent_unless_the_coach_unticks_it(app, client):
    ids = _seed(app, names=("Ana Silva",))
    _remove(client, ids, reason="Chuva forte")
    assert "Chuva forte" in _messages(app)[0][0]


@pytest.mark.criterion("CLASSES-DELETE-11")
@pytest.mark.parametrize("fields", [
    {"reason": "Chuva forte", "sendReason": False}, {"reason": "   ", "sendReason": True}, {},
])
def test_an_unsent_or_empty_reason_leaves_no_sentence(app, client, fields):
    ids = _seed(app)
    assert _remove(client, ids, **fields).status_code == 200
    messages = _messages(app)
    assert len(messages) == 2
    for text, metadata in messages:
        assert metadata["cancelReason"] is None
        for trace in ("Motivo", "Reason", ": .", "Chuva", "{"):
            assert trace not in text, text


@pytest.mark.criterion("CLASSES-DELETE-11")
def test_without_the_fields_the_text_is_exactly_todays(app, client):
    ids = _seed(app, names=("Ana Silva",))
    _remove(client, ids)
    assert _messages(app)[0][0] == "Olá Ana, a tua aula de terça-feira às 19:00 foi cancelada. " + SORRY


@pytest.mark.criterion("CLASSES-DELETE-12")
@pytest.mark.parametrize("reason", ["x" * 201, 7, ["Chuva"]])
def test_a_reason_over_the_limit_is_refused_whole(app, client, reason):
    ids = _seed(app)
    with patch("padel_app.services.engine_entry.withdraw_before_removal") as withdraw:
        resp = _remove(client, ids, reason=reason)
    assert resp.status_code == 400 and resp.get_json()["fields"] == ["reason"]
    assert not withdraw.called and _messages(app) == []
    assert _kept(app, ids) is None
    with app.app_context():
        from padel_app.models.lessons import Lesson

        assert not db.session.get(Lesson, ids["lesson_id"]).excluded_dates
    assert _remove(client, ids, reason="x" * 200).status_code == 200
    assert "x" * 200 in _messages(app)[0][0]


@pytest.mark.criterion("CLASSES-DELETE-13")
def test_this_and_all_future_shares_one_reason(app, client):
    ids = _seed(app)
    resp = _remove(client, ids, week=1, scope="future", reason="Fim da época")
    assert resp.get_json() == {"status": "recurrence_truncated"}
    assert [("Fim da época" in text) for text, _ in _messages(app)] == [True, True]
    (entry,) = _kept(app, ids)
    assert {k: entry[k] for k in ("date", "scope", "reason", "sentToStudents")} == {
        "date": "2027-03-16", "scope": "future", "reason": "Fim da época", "sentToStudents": True}


# --- where it is kept ---------------------------------------------------------------------------

@pytest.mark.criterion("CLASSES-DELETE-14")
def test_the_reason_is_kept_where_the_class_survives(app, client):
    weekly, one_off = _seed(app), _seed(app, recurring=False, username="p840b", names=("Ana Silva",))
    _remove(client, weekly, reason="Chuva", sendReason=False)
    _remove(client, weekly, week=1)  # no reason: no entry
    (entry,) = _kept(app, weekly)
    assert {k: entry[k] for k in ("date", "scope", "reason", "sentToStudents")} == {
        "date": "2027-03-09", "scope": "single", "reason": "Chuva", "sentToStudents": False}
    assert entry["at"]
    # A second one is added to the first.
    _remove(client, weekly, week=2, reason="Vento")
    assert [(e["date"], e["sentToStudents"]) for e in _kept(app, weekly)] == [("2027-03-09", False), ("2027-03-23", True)]

    assert _remove(client, one_off, reason="Lesão").get_json() == {"status": "deleted"}
    assert _kept(app, one_off) is None
    assert _messages(app)[-1][1]["cancelReason"] == "Lesão"


@pytest.mark.criterion("CLASSES-DELETE-14")
def test_a_materialised_occurrence_keeps_it_and_an_empty_class_sent_it_to_nobody(app, client):
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    ids = _seed(app, names=())
    with app.app_context():
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson_id"]), START.date())
        db.session.commit()
        event = {"model": "LessonInstance", "originalId": instance.id, "date": "2027-03-09"}
    with patch(PATCHES[0]), patch(PATCHES[1]):
        resp = client.post("/api/app/remove_class", headers=ids["headers"],
                           json={"event": event, "scope": "single", "reason": "Chuva"})
    assert resp.get_json() == {"status": "single_removed"}
    (entry,) = _kept(app, ids)
    assert (entry["date"], entry["sentToStudents"]) == ("2027-03-09", False)


@pytest.mark.criterion("CLASSES-DELETE-14")
def test_a_removal_that_fails_writes_no_entry(app, client, monkeypatch):
    import padel_app.services.lesson_service as ls

    ids = _seed(app)
    real = ls._keep_cancel_reason

    def kept_then_fails(*args, **kwargs):
        real(*args, **kwargs)
        raise RuntimeError("injected after the reason was written")

    monkeypatch.setattr(ls, "_keep_cancel_reason", kept_then_fails)
    with app.app_context():
        with pytest.raises(RuntimeError, match="injected"):
            ls.remove_class_service(_body(ids, reason="Chuva"))
        db.session.rollback()
    assert _kept(app, ids) is None and _messages(app) == []


# --- the preview --------------------------------------------------------------------------------

@pytest.mark.criterion("CLASSES-DELETE-15")
def test_the_preview_renders_the_first_students_message(app, client):
    ids = _seed(app)
    shown = _preview(client, ids, reason="Chuva forte", sendReason=True)
    assert shown == {"recipients": 2, "text": "Olá Ana, a tua aula de terça-feira às 19:00 foi cancelada. "
                                              "Motivo indicado pelo professor: Chuva forte. " + SORRY}
    assert "Motivo" not in _preview(client, ids, reason="Chuva forte", sendReason=False)["text"]
    assert _messages(app) == [] and _kept(app, ids) is None
    _remove(client, ids, reason="Chuva forte", sendReason=True)
    assert shown["text"] in [text for text, _ in _messages(app)]


@pytest.mark.criterion("CLASSES-DELETE-15")
@pytest.mark.parametrize("language, name", [("pt", "Olá Aluno,"), ("en", "Hi Student,")])
def test_the_preview_of_an_empty_class_names_nobody(app, client, language, name):
    ids = _seed(app, names=(), language=language)
    shown = _preview(client, ids, reason="Chuva")
    assert shown["recipients"] == 0 and shown["text"].startswith(name)


@pytest.mark.criterion("CLASSES-DELETE-15")
def test_the_preview_is_for_the_classs_own_coach_and_checks_the_reason(app, client):
    ids, other = _seed(app), _seed(app, username="p840other", names=())
    resp = client.post("/api/app/class_cancellation_preview", json=_body(ids), headers=other["headers"])
    assert resp.status_code == 403
    for body in (_body(ids, reason="x" * 201), {"scope": "single"}):
        resp = client.post("/api/app/class_cancellation_preview", json=body, headers=ids["headers"])
        assert resp.status_code == 400


# --- reading it back ----------------------------------------------------------------------------

@pytest.mark.criterion("CLASSES-DELETE-19")
def test_the_cancellations_are_read_back_for_the_coach_only(app, client):
    ids, other = _seed(app), _seed(app, username="p840other", names=())
    _remove(client, ids, week=0, reason="Chuva", sendReason=True)
    _remove(client, ids, week=1, scope="future", reason="Fim da época", sendReason=False)
    url = f"/api/app/class/{ids['lesson_id']}/cancellations"
    assert client.get(url, headers=ids["headers"]).get_json() == {"cancellations": [
        {"date": "2027-03-16", "scope": "future", "reason": "Fim da época", "sentToStudents": False},
        {"date": "2027-03-09", "scope": "single", "reason": "Chuva", "sentToStudents": True},
    ]}
    assert client.get(url, headers=other["headers"]).status_code == 403
    assert client.get(url).status_code == 401


@pytest.mark.criterion("CLASSES-DELETE-19")
def test_a_class_with_no_cancellation_answers_an_empty_list(app, client):
    ids = _seed(app)
    resp = client.get(f"/api/app/class/{ids['lesson_id']}/cancellations", headers=ids["headers"])
    assert resp.get_json() == {"cancellations": []}


@pytest.mark.criterion("CLASSES-DELETE-19")
def test_the_class_detail_names_its_class(app, client):
    ids = _seed(app)
    resp = client.post(f"/api/app/class_instance?model=Lesson&id={ids['lesson_id']}&date=2027-03-09", headers=ids["headers"])
    assert resp.get_json()["lessonId"] == str(ids["lesson_id"])


# --- the template -------------------------------------------------------------------------------

@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-32")
def test_the_default_reads_whole_with_and_without_a_reason():
    pt, en = DEFAULT_MESSAGE_TEMPLATES_PT["class_cancelled"], DEFAULT_MESSAGE_TEMPLATES["class_cancelled"]
    assert _format(pt, reason="Chuva forte") == (
        "Olá Ana, a tua aula de quarta-feira às 19:00 foi cancelada. "
        "Motivo indicado pelo professor: Chuva forte. " + SORRY)
    for new, before in ((pt, BEFORE_PT), (en, BEFORE_EN)):
        for nothing in ({}, {"reason": ""}, {"reason": None}, {"reason": "  "}):
            assert _format(new, **nothing) == _format(before)


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-33")
@pytest.mark.parametrize("reason, ending", [
    ("Avaria no campo {court}!", "professor: Avaria no campo {court}! " + SORRY),
    ("Chuva.", "professor: Chuva. " + SORRY),
    ("Já?", "professor: Já? " + SORRY),
    ("Vento ,  muito ()\nforte", "professor: Vento ,  muito ()\nforte. " + SORRY),
    ("{reason} {name} de {level}", "professor: {reason} {name} de {level}. " + SORRY),
])
def test_the_reason_is_verbatim_with_one_stop(reason, ending):
    text = _format(DEFAULT_MESSAGE_TEMPLATES_PT["class_cancelled"], court="Campo 2", level="", reason=reason)
    assert text.endswith(ending), text


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-33")
@pytest.mark.parametrize("template, expected", [
    ("Boa {name}! Motivo: {reason}. Até já!", "Boa Ana! Até já!"),
    ("Olá {name}\nMotivo: {reason}\nAté já", "Olá Ana\nAté já"),
    ("Motivo: {reason}. Olá {name}.", "Olá Ana."),
    ("Olá {name}. Motivo: {reason}", "Olá Ana."),
    ("Às 19.30 em ponto. Motivo, {reason}, ver pág. 2 de 3.5!! Fim", "Às 19.30 em ponto. 2 de 3.5!! Fim"),
    ("A {reason}. B. C {reason}! D", "B. D"),
])
def test_a_stray_reason_takes_its_sentence_anywhere(template, expected):
    assert _format(template) == expected


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-34")
def test_a_stored_copy_of_the_earlier_default_reads_as_the_new_one(app):
    from padel_app.models.notification_config import NotificationConfig

    pt, en = DEFAULT_MESSAGE_TEMPLATES_PT["class_cancelled"], DEFAULT_MESSAGE_TEMPLATES["class_cancelled"]
    for stored, read in ((BEFORE_PT, pt), (BEFORE_EN, en), (BEFORE_PT + " ", BEFORE_PT + " "), ("Cancelada.", "Cancelada.")):
        for locale in ("pt", "en"):
            config = NotificationConfig(message_templates={"class_cancelled": stored})
            assert config.get_message_templates(locale)["class_cancelled"] == read
            assert config.message_templates == {"class_cancelled": stored}


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-34")
def test_a_coach_holding_the_earlier_default_sends_the_reason(app, client):
    ids = _seed(app, names=("Ana Silva",))
    _template(app, ids, BEFORE_PT)
    _remove(client, ids, reason="Chuva")
    assert "Motivo indicado pelo professor: Chuva." in _messages(app)[0][0]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-36")
def test_a_text_left_empty_falls_back_to_the_default(app, client):
    ids = _seed(app, names=("Ana Silva",))
    _template(app, ids, "Aula cancelada: {reason}")
    _remove(client, ids)
    _remove(client, ids, week=1, reason="Chuva")
    assert [text for text, _ in _messages(app)] == [
        "Olá Ana, a tua aula de terça-feira às 19:00 foi cancelada. " + SORRY, "Aula cancelada: Chuva"]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-35")
def test_the_settings_preview_shows_the_example_reason_only_under_its_key(app, client):
    ids = _seed(app, names=())

    def preview(**fields):
        return client.post("/api/app/notify/template_preview", headers=ids["headers"],
                           json={"template": "Olá. Motivo: {reason}.", **fields}).get_json()

    assert preview(key="class_cancelled")["text"] == "Olá. Motivo: Chuva forte."
    assert preview()["examples"]["reason"] == "Chuva forte"
    for fields in ({}, {"key": "invite"}, {"key": ["class_cancelled"]}):
        assert preview(**fields)["text"] == "Olá."
