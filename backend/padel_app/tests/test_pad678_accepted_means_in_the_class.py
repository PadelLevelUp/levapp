"""PAD-678 — classes.join-requests rule 19 (numbering unconfirmed): the message a student gets
when the coach accepts their join request says they have a place in the class.

"Estás dentro: o teu pedido para … foi aceite." was read by two students as a place on the
waiting list. The approved text leads with the outcome and never says "pedido" or "aceite";
its `{when}` is the weekday-first form of message-templates rule 17.
"""
from datetime import datetime

from padel_app.sql_db import db
from padel_app.tests.test_pad519_the_day_in_the_notice import PT_WEEKDAYS, EN_WEEKDAYS, _quiet


def _weekday_first(dt, locale="pt"):
    wd = (PT_WEEKDAYS if locale == "pt" else EN_WEEKDAYS)[dt.weekday()]
    if locale == "pt":
        return f" {'no' if dt.weekday() >= 5 else 'na'} {wd}, {dt:%d/%m}, às {dt:%H:%M}"
    return f" on {wd}, {dt:%d/%m}, at {dt:%H:%M}"


def test_the_formatter_has_a_weekday_first_form(app):
    """The literals are rule 19's and rule 17's own examples."""
    from padel_app.services.notification_service import _format_when

    friday = datetime(2026, 10, 16, 9, 0)
    saturday = datetime(2026, 10, 17, 18, 0)
    assert _format_when(friday, "pt", dated=True, weekday_first=True) == " na sexta-feira, 16/10, às 09:00"
    assert _format_when(saturday, "pt", dated=True, weekday_first=True) == " no sábado, 17/10, às 18:00"
    assert _format_when(friday, "en", dated=True, weekday_first=True) == " on Friday, 16/10, at 09:00"
    # Every other notice keeps rule 17's day-first form.
    assert _format_when(friday, "pt", dated=True) == " no dia 16/10 (sexta-feira) às 09:00"


def _accept(app, language=None, title=None):
    from padel_app.models import Coach, LessonInstance
    from padel_app.tests.test_pad131_join_requests import (
        LEVEL_SAME, _config, _decide, _messages_for, _request, _student,
    )
    from padel_app.tests.test_pad128_eligibility import _seed

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        instance = db.session.get(LessonInstance, ids["instance_id"])
        if title is not None:
            instance.overwrite_title = title
        if language is not None:
            db.session.get(Coach, ids["coach_id"]).user.language = language
        db.session.commit()
        start = instance.start_datetime
        shown_title = instance.title
    pid = _student(app, ids, "carla")
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    texts = [t for _, t, _ in _messages_for(app, ids, pid)]
    return texts, start, shown_title


def test_a_pt_student_reads_that_they_are_in_the_class(app, monkeypatch):
    _quiet(monkeypatch)
    texts, start, title = _accept(app, title="PEAK PERFORMANCE")
    told = [t for t in texts if t.startswith("Está marcado!")]
    assert told == [f"Está marcado! Estás inscrito/a em PEAK PERFORMANCE{_weekday_first(start)}. Contamos contigo!"], texts
    assert "pedido" not in told[0] and "aceite" not in told[0]


def test_an_english_coach_sends_the_english_text(app, monkeypatch):
    _quiet(monkeypatch)
    texts, start, _ = _accept(app, language="en", title="PEAK PERFORMANCE")
    told = [t for t in texts if t.startswith("You're booked!")]
    assert told == [f"You're booked! You're enrolled in PEAK PERFORMANCE{_weekday_first(start, 'en')}. See you there!"], texts


def test_a_class_with_no_title_reads_nesta_aula(app):
    """Rule 19: no title gives "nesta aula" / "in this class", never "na aula na sexta-feira"."""
    from padel_app.services.class_join_request_service import _accepted_text

    class _Untitled:
        title = None
        start_datetime = datetime(2026, 10, 18, 10, 0)   # a Sunday: "no domingo"

    assert _accepted_text(_Untitled(), "pt") == "Está marcado! Estás inscrito/a nesta aula no domingo, 18/10, às 10:00. Contamos contigo!"
    assert _accepted_text(_Untitled(), "en") == "You're booked! You're enrolled in this class on Sunday, 18/10, at 10:00. See you there!"


def test_a_refusal_says_not_enrolled_in_both_languages(app):
    """Rule 19a: the refusal leads with the outcome, same `{when}` and untitled form as rule 19."""
    from padel_app.services.class_join_request_service import _declined_text

    class _Class:
        title = "PEAK PERFORMANCE"
        start_datetime = datetime(2026, 10, 16, 9, 0)   # a Friday

    class _Untitled:
        title = None
        start_datetime = datetime(2026, 10, 18, 10, 0)   # a Sunday

    assert _declined_text(_Class(), "pt") == (
        "Não ficaste inscrito/a em PEAK PERFORMANCE na sexta-feira, 16/10, às 09:00: "
        "o treinador não aceitou o pedido desta vez."
    )
    assert _declined_text(_Class(), "en") == (
        "You're not enrolled in PEAK PERFORMANCE on Friday, 16/10, at 09:00: "
        "the coach didn't accept the request this time."
    )
    assert _declined_text(_Untitled(), "pt").startswith("Não ficaste inscrito/a nesta aula no domingo, 18/10")


def test_the_waiting_list_confirmation_says_there_is_no_place_yet():
    """PAD-678 #4: the default `waiting_list_confirm` leads with "on the list, no place yet". A coach
    who saved the template editor keeps their stored text (not migrated, coordinator 2026-10-22)."""
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT

    assert DEFAULT_MESSAGE_TEMPLATES_PT["waiting_list_confirm"] == (
        "Ficaste em lista de espera. Ainda não tens lugar; avisamos-te se abrir uma vaga."
    )
    assert DEFAULT_MESSAGE_TEMPLATES["waiting_list_confirm"] == (
        "You're on the waiting list. You don't have a place yet; we'll let you know if a spot opens."
    )
