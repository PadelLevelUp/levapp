"""PAD-928: a coach taking a student off a class tells the student, as a cancelled class does.

One date (classes.instance-enrollment rule 11a) sends `removed_from_class`; a recurring class from a
date on (classes.enrollment rule 4) sends one `removed_from_series`. Both are messages in the
coach-student thread (`_send_system_message`), rendered in the coach's locale
(notifications.message-templates rule 24). Nothing for a class that started or was cancelled, a date
the student already gave up, or anything the student did themselves.
"""
import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import PATCHES
from padel_app.tests.test_pad259_enrolment import _materialise


# --- seeding ---------------------------------------------------------------------------------------

def _people(app, *, language="pt"):
    """A coach (in `language`) and student "Rita Silva"."""
    from padel_app.models import Coach, Player, User

    with app.app_context():
        coach_user = User(name="Treinador Rui", username="coach-rui", email="rui@t.com", password="x",
                          status="active", language=language)
        rita_user = User(name="Rita Silva", username="rita", email="rita@t.com", password="x", status="active")
        db.session.add_all([coach_user, rita_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        rita = Player(user_id=rita_user.id)
        db.session.add_all([coach, rita])
        db.session.commit()
        return {"coach_id": coach.id, "rita": rita.id, "rita_user": rita_user.id}


def _weekly(app, coach_id, player_ids, *, start=None, weeks=6, club="Padel Norte"):
    """A weekly recurring class (first occurrence `start`, default tomorrow 19:00) with a roster."""
    from padel_app.models import Association_CoachLesson, Association_PlayerLesson, Club, Lesson

    with app.app_context():
        c = Club(name=club, description="", location="City")
        db.session.add(c)
        db.session.flush()
        start = start or (datetime.utcnow() + timedelta(days=1)).replace(hour=19, minute=0, second=0, microsecond=0)
        lesson = Lesson(
            title="Sexta 19h", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=True,
            recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}),
            recurrence_end=(start + timedelta(weeks=weeks)).date(),
            type="academy", max_players=4, color="#000", status="active", club_id=c.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        for pid in player_ids:
            db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lesson.id))
        db.session.commit()
        return lesson.id, start


def _one_off(app, coach_id, player_id, *, start=None, hours_ahead=72):
    """A one-off class (no recurrence) with the player on its roster and its one occurrence."""
    from padel_app.models import (Association_CoachLesson, Association_PlayerLesson, Club, Lesson,
                                  LessonInstance)
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        c = Club(name="Padel Norte", description="", location="City")
        db.session.add(c)
        db.session.flush()
        start = start or (datetime.utcnow() + timedelta(hours=hours_ahead)).replace(second=0, microsecond=0)
        lesson = Lesson(title="Aula", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                        club_id=c.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        db.session.add(Association_PlayerLesson(player_id=player_id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=4, status="scheduled", notifications_enabled=True)
        db.session.add(inst)
        db.session.commit()
        with patch(PATCHES[2]), patch(PATCHES[3]), patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            enrol(player_id, inst, "coach")
        return inst.id


def _edit(app, model, original_id, day, scope, updates):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
            patch("padel_app.scheduler._maybe_schedule_instance"), \
            patch("padel_app.scheduler.cancel_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.schedule_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.prune_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.move_lesson_reminder_jobs"):
        result, status = edit_class_service({
            "event": {"model": model, "originalId": original_id, "date": day.isoformat()},
            "scope": scope,
            "updates": updates,
        })
        db.session.commit()
        return result, status


def _notices(app, user_id):
    """Every removal notice in this student's threads, oldest first."""
    from padel_app.models import ConversationParticipant, Message

    with app.app_context():
        convs = {c.conversation_id for c in ConversationParticipant.query.filter_by(user_id=user_id).all()}
        return [
            (m.text, dict(m.msg_metadata or {}))
            for m in Message.query.order_by(Message.id).all()
            if m.conversation_id in convs and (m.msg_metadata or {}).get("removedFromClass") is True
        ]


def _set_templates(app, coach_id, templates):
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        get_or_create_config(coach_id).message_templates = templates
        db.session.commit()


def _ddmm(dt):
    return dt.strftime("%d/%m")


# --- notifications.message-templates rule 24 ------------------------------------------------------

@pytest.mark.parametrize("language", ["pt", "en"])
@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-29")
def test_the_removal_defaults_render_whole_in_both_locales(app, language):
    from padel_app.models import Lesson, LessonInstance
    from padel_app.services.system_messages import notify_student_removed

    ids = _people(app, language=language)
    friday = datetime(2025, 11, 21, 19, 0)  # a Friday
    lesson_id, _ = _weekly(app, ids["coach_id"], [ids["rita"]], start=friday)
    bare_id, _ = _weekly(app, ids["coach_id"], [ids["rita"]], start=friday, club="")
    with app.app_context(), patch(PATCHES[2]), patch(PATCHES[3]), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        for lid in (lesson_id, bare_id):
            lesson = db.session.get(Lesson, lid)
            inst = LessonInstance(lesson_id=lid, start_datetime=friday, end_datetime=friday + timedelta(hours=1),
                                  max_players=4, status="scheduled")
            db.session.add(inst)
            db.session.commit()
            notify_student_removed(inst, ids["rita"])
            notify_student_removed(lesson, ids["rita"], series=True)

    (one, _), (series, meta), (one_bare, _), (series_bare, _) = _notices(app, ids["rita_user"])
    if language == "pt":
        assert one == ("Olá Rita, foste removido da aula de sexta-feira, 21/11, às 19:00 (Padel Norte). "
                       "Qualquer dúvida, fala com o teu treinador.")
        assert series == ("Olá Rita, foste removido da turma de sexta-feira às 19:00 (Padel Norte) e já não estás "
                          "inscrito nas próximas aulas. Qualquer dúvida, fala com o teu treinador.")
        assert one_bare.startswith("Olá Rita, foste removido da aula de sexta-feira, 21/11, às 19:00. Qualquer")
    else:
        assert one == ("Hi Rita, you've been removed from the class on Friday, 21/11, at 19:00 (Padel Norte). "
                       "If you have any questions, talk to your coach.")
        assert series == ("Hi Rita, you've been removed from the Friday 19:00 class (Padel Norte) and are no longer "
                          "booked for its upcoming classes. If you have any questions, talk to your coach.")
        assert one_bare.startswith("Hi Rita, you've been removed from the class on Friday, 21/11, at 19:00. If")
    assert meta.get("series") is True
    for text in (one, series, one_bare, series_bare):
        assert "{" not in text and "()" not in text, text
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT

    for defaults in (DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT):
        for key in ("removed_from_class", "removed_from_series"):
            assert "{level}" not in defaults[key]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-30")
def test_a_coachs_removal_text_wins_and_a_blank_falls_back(app, client):
    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    instance_id = _materialise(app, lesson_id, start.date())
    _set_templates(app, ids["coach_id"], {"removed_from_class": "Saíste da aula de {day} às {time}.",
                                          "removed_from_series": "   "})

    _edit(app, "LessonInstance", instance_id, start.date(), "single", {"removePlayers": [ids["rita"]]})
    _edit(app, "Lesson", lesson_id, start.date(), "future", {"removePlayers": [ids["rita"]]})

    (one, _), (series, _) = _notices(app, ids["rita_user"])
    assert one == "Saíste da aula de amanhã às 19:00."
    assert series.startswith("Olá Rita, foste removido da turma de ")
    with app.app_context():
        from padel_app.models import NotificationConfig

        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
        assert config.message_templates["removed_from_series"] == "   ", "the stored blank stays blank"
        assert config.get_message_templates("pt")["removed_from_series"].strip()


# --- classes.instance-enrollment rule 11a ---------------------------------------------------------

@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-36")
def test_a_coach_removing_a_student_from_one_future_date_tells_them(app):
    from padel_app.models import Association_PlayerLesson

    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    instance_id = _materialise(app, lesson_id, start.date())

    result, status = _edit(app, "LessonInstance", instance_id, start.date(), "single",
                           {"removePlayers": [ids["rita"]]})
    assert status == 200, result

    notices = _notices(app, ids["rita_user"])
    assert len(notices) == 1
    text, meta = notices[0]
    assert text.startswith(f"Olá Rita, foste removido da aula de ")
    assert f", {_ddmm(start)}, às 19:00 (Padel Norte)." in text
    assert meta == {"removedFromClass": True, "lessonInstanceId": instance_id}
    with app.app_context():
        assert Association_PlayerLesson.query.filter_by(player_id=ids["rita"], lesson_id=lesson_id).count() == 1


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-37")
def test_a_virtual_date_and_a_one_off_class_send_the_one_date_notice(app):
    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    later = start + timedelta(weeks=1)  # never materialised
    _, status = _edit(app, "Lesson", lesson_id, later.date(), "single", {"removePlayers": [ids["rita"]]})
    assert status in (200, 201)

    one_off_iid = _one_off(app, ids["coach_id"], ids["rita"])
    with app.app_context():
        from padel_app.models import LessonInstance

        one_off = db.session.get(LessonInstance, one_off_iid)
        one_off_lesson, one_off_start = one_off.lesson_id, one_off.start_datetime
    _edit(app, "Lesson", one_off_lesson, one_off_start.date(), "future", {"removePlayers": [ids["rita"]]})

    texts = [t for t, _ in _notices(app, ids["rita_user"])]
    assert len(texts) == 2, texts
    assert f", {_ddmm(later)}, às 19:00" in texts[0]
    assert f", {_ddmm(one_off_start)}, às " in texts[1] and "turma" not in texts[1]


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-38")
def test_no_notice_for_a_started_or_cancelled_class_or_a_date_given_up(app):
    from padel_app.models import LessonInstance, Presence
    from padel_app.utils.dates import club_now_naive

    ids = _people(app)
    with app.app_context():
        started_at = club_now_naive() - timedelta(minutes=5)
    started = _one_off(app, ids["coach_id"], ids["rita"], start=started_at)
    cancelled = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=72)
    given_up = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=96)
    not_on = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=120)
    with app.app_context():
        db.session.get(LessonInstance, cancelled).status = "canceled"
        Presence.query.filter_by(player_id=ids["rita"], lesson_instance_id=given_up).one().status = "absent"
        Presence.query.filter_by(player_id=ids["rita"], lesson_instance_id=not_on).delete()
        db.session.commit()
        days = {iid: db.session.get(LessonInstance, iid).start_datetime.date()
                for iid in (started, cancelled, given_up, not_on)}

    for iid, day in days.items():
        _edit(app, "LessonInstance", iid, day, "single", {"removePlayers": [ids["rita"]]})

    assert _notices(app, ids["rita_user"]) == []


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-39")
def test_the_students_own_leaving_sends_no_removal_notice(app):
    """The student declining or cancelling, and the shared writer used outside a coach's class edit
    (the engine's and every other path's `unenrol`), owe no notice."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import unenrol
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder

    ids = _people(app)
    a = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=72)
    b = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=96)
    c = _one_off(app, ids["coach_id"], ids["rita"], hours_ahead=120)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        respond_to_reminder(a, "no", ids["rita_user"])
        respond_to_reminder(b, "yes", ids["rita_user"])
        cancel_attendance(ids["rita_user"], lesson_instance_id=b)
        unenrol(ids["rita"], db.session.get(LessonInstance, c))
        db.session.commit()

    assert _notices(app, ids["rita_user"]) == []


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-40")
def test_the_freed_seat_follows_the_vacancy_flow_unchanged(app):
    from padel_app.services import notification_service

    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    instance_id = _materialise(app, lesson_id, start.date())
    real, calls = notification_service.vacancies_after_class_edit, []

    def spy(inst, **kwargs):
        calls.append((inst.id, kwargs.get("place_freed")))
        return real(inst, **kwargs)

    with patch.object(notification_service, "vacancies_after_class_edit", side_effect=spy):
        _edit(app, "LessonInstance", instance_id, start.date(), "single", {"removePlayers": [ids["rita"]]})

    assert (instance_id, True) in calls, "the seat opens through the same call as before"
    assert len(_notices(app, ids["rita_user"])) == 1


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-41")
def test_a_failed_removal_notice_never_fails_the_edit(app):
    from padel_app.models import Presence

    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    instance_id = _materialise(app, lesson_id, start.date())
    with patch("padel_app.services.system_messages._send_system_message", side_effect=RuntimeError("down")), \
            patch.object(app.logger, "exception") as logged:
        result, status = _edit(app, "LessonInstance", instance_id, start.date(), "single",
                               {"removePlayers": [ids["rita"]]})

    assert status == 200, result
    with app.app_context():
        assert Presence.query.filter_by(player_id=ids["rita"], lesson_instance_id=instance_id).first() is None
    assert any("notify_student_removed" in str(c.args[0]) for c in logged.call_args_list)


# --- classes.enrollment rule 4 ---------------------------------------------------------------------

@pytest.mark.criterion("CLASSES-ENROLLMENT-1")
def test_removing_a_student_from_the_series_sends_one_notice(app):
    from padel_app.models import LessonInstance, Presence

    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    first = _materialise(app, lesson_id, start.date())
    second = _materialise(app, lesson_id, (start + timedelta(weeks=1)).date())

    result, status = _edit(app, "LessonInstance", first, start.date(), "future", {"removePlayers": [ids["rita"]]})
    assert status == 201, result

    notices = _notices(app, ids["rita_user"])
    assert len(notices) == 1, notices
    text, meta = notices[0]
    assert text.startswith("Olá Rita, foste removido da turma de ") and "às 19:00 (Padel Norte)" in text
    assert meta.get("series") is True and "lessonInstanceId" not in meta
    with app.app_context():
        for iid in (first, second):
            assert Presence.query.filter_by(player_id=ids["rita"], lesson_instance_id=iid).first() is None


@pytest.mark.criterion("CLASSES-ENROLLMENT-2")
def test_a_mid_series_removal_dates_the_first_class_left(app):
    ids = _people(app)
    lesson_id, start = _weekly(app, ids["coach_id"], [ids["rita"]])
    _set_templates(app, ids["coach_id"], {"removed_from_series": "Sais da turma a partir de {date}."})
    boundary = start + timedelta(weeks=2)
    iid = _materialise(app, lesson_id, boundary.date())

    result, status = _edit(app, "LessonInstance", iid, boundary.date(), "future", {"removePlayers": [ids["rita"]]})
    assert status == 201 and result["id"] != lesson_id, "the edit split the series"

    assert [t for t, _ in _notices(app, ids["rita_user"])] == [f"Sais da turma a partir de {_ddmm(boundary)}."]


@pytest.mark.criterion("CLASSES-ENROLLMENT-3")
def test_no_series_notice_when_no_class_is_ahead(app):
    from padel_app.utils.dates import club_now_naive

    ids = _people(app)
    with app.app_context():
        last = (club_now_naive() - timedelta(minutes=5)).replace(second=0, microsecond=0)
    lesson_id, _ = _weekly(app, ids["coach_id"], [ids["rita"]], start=last - timedelta(weeks=2), weeks=2)

    _, status = _edit(app, "Lesson", lesson_id, last.date(), "future", {"removePlayers": [ids["rita"]]})
    assert status in (200, 201)
    assert _notices(app, ids["rita_user"]) == []
