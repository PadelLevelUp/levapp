"""notifications.message-templates rules 18–19 (PAD-549): the {day} placeholder and the preview."""
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.tests.test_player_claim_merge import _coach, _student

WED = datetime(2026, 10, 7, 10, 0)     # a Wednesday, club wall clock


@pytest.mark.parametrize("start, pt, en", [
    (datetime(2026, 10, 7, 18, 0), "hoje", "today"),
    (datetime(2026, 10, 8, 18, 0), "amanhã", "tomorrow"),
    (datetime(2026, 10, 9, 18, 0), "depois de amanhã", "the day after tomorrow"),
    (datetime(2026, 10, 10, 9, 0), "este sábado", "this Saturday"),
    (datetime(2026, 10, 11, 9, 0), "este domingo", "this Sunday"),
    (datetime(2026, 10, 12, 18, 0), "a próxima segunda-feira", "next Monday"),
    (datetime(2026, 10, 16, 18, 0), "a próxima sexta-feira", "next Friday"),
    (datetime(2026, 10, 18, 18, 0), "o próximo domingo", "next Sunday"),
    (datetime(2026, 10, 19, 18, 0), "dia 19/10", "19/10"),
    (datetime(2026, 10, 6, 18, 0), "dia 06/10", "06/10"),
])
def test_the_day_reads_like_a_person_would(app, start, pt, en):
    from padel_app.services.notification_service import format_relative_day

    with app.app_context():
        assert format_relative_day(start, "pt", now=WED) == pt
        assert format_relative_day(start, "en", now=WED) == en


def test_from_a_friday_a_monday_three_days_on_is_next_week(app):
    from padel_app.services.notification_service import format_relative_day

    with app.app_context():
        assert format_relative_day(datetime(2026, 10, 12, 18, 0), "pt", now=datetime(2026, 10, 9, 23, 59)) == "a próxima segunda-feira"


def test_the_day_is_computed_when_the_message_renders(app, monkeypatch):
    """Rule 18: at send time, on the club clock. A message held past midnight says "hoje"."""
    from padel_app.services import notification_service as ns
    from padel_app.models import LessonInstance

    inst = LessonInstance(start_datetime=datetime(2026, 10, 8, 18, 0), end_datetime=datetime(2026, 10, 8, 19, 0))
    with app.app_context():
        monkeypatch.setattr(ns, "utcnow_naive", lambda: datetime(2026, 10, 7, 21, 0))   # 22:00 Lisbon, Wed
        assert ns.class_placeholders(inst, "pt")["day"] == "amanhã"
        monkeypatch.setattr(ns, "utcnow_naive", lambda: datetime(2026, 10, 7, 23, 30))  # 00:30 Lisbon, Thu
        assert ns.class_placeholders(inst, "pt")["day"] == "hoje"
        text = ns._format_template("Abriu uma vaga para {day} às {time}!", time="18:00",
                                   **ns.class_placeholders(inst, "pt"))
        assert text == "Abriu uma vaga para hoje às 18:00!"


@pytest.fixture
def coach_auth(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    cu, _, _, _ = _coach(app)
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(cu))}"}


def test_the_preview_renders_through_the_real_formatter(client, coach_auth):
    res = client.post("/api/app/notify/template_preview", headers=coach_auth,
                      json={"template": "Olá {name}, abriu vaga para {day} às {time} ({court}). Aula de {level}."})
    assert res.status_code == 200
    body = res.get_json()
    assert body["text"] == f"Olá Ana, abriu vaga para amanhã às 18:00 ({body['examples']['court']}). Aula de {body['examples']['level']}."
    assert "{" not in body["text"]
    assert set(body["examples"]) == {"name", "level", "weekday", "time", "type", "date", "court", "day", "class", "when", "side"}


def test_the_preview_is_for_coaches_and_takes_a_string(app, client, coach_auth):
    su, _ = _student(app, username="s549")
    with app.app_context():
        student = {"Authorization": f"Bearer {create_access_token(identity=str(su))}"}
    assert client.post("/api/app/notify/template_preview", headers=student, json={"template": "x"}).status_code == 403
    assert client.post("/api/app/notify/template_preview", headers=coach_auth, json={"template": 5}).status_code == 400
