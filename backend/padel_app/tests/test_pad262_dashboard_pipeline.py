"""PAD-262 — dashboard.blocks rule 8 (audit H9): the coach home loads its
classes once, the instance loader is scoped to the coach in SQL with a fixed
statement count per window, and the replies queue is capped in the database.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta

from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.test_dashboard_coach_home import _seed


@contextmanager
def _statements(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


def _other_coach_with_classes(app, *, now, count):
    """Another coach with `count` instances in the same window — must never be
    loaded for the first coach, whichever junction carries the coach."""
    from padel_app.models import (
        Association_CoachLesson,
        Association_CoachLessonInstance,
        Club,
        LessonInstance,
        User,
    )
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson

    with app.app_context():
        u = User(name="Other Coach", username="ch_other", password="x")
        db.session.add(u)
        db.session.flush()
        other = Coach(user_id=u.id)
        db.session.add(other)
        db.session.flush()
        club = Club.query.first()
        ids = []
        for i in range(count):
            start = now + timedelta(hours=2 + i)
            lesson = Lesson(title=f"Other {i}", start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=other.id, lesson_id=lesson.id))
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  max_players=4, status="scheduled", original_lesson_occurence_date=start.date())
            db.session.add(inst)
            db.session.flush()
            if i % 2 == 0:  # half carry their own coach junction, half inherit the lesson's
                db.session.add(Association_CoachLessonInstance(coach_id=other.id, lesson_instance_id=inst.id))
            ids.append(inst.id)
        db.session.commit()
        return other.id, ids


def test_instance_loader_is_scoped_to_the_coach_in_sql(app):
    from padel_app.helpers.calendar_helpers import load_lesson_instances_for_coach

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, _, soon_id = _seed(app, now=now)
    other_id, other_ids = _other_coach_with_classes(app, now=now, count=4)

    with app.app_context():
        mine = load_lesson_instances_for_coach(coach_id, now - timedelta(days=30), now + timedelta(days=30))
        theirs = load_lesson_instances_for_coach(other_id, now - timedelta(days=30), now + timedelta(days=30))
    assert soon_id in {i.id for i in mine.values()}
    assert not ({i.id for i in mine.values()} & set(other_ids))
    # Both junction shapes resolve for the other coach.
    assert {i.id for i in theirs.values()} == set(other_ids)


def test_a_window_costs_a_fixed_number_of_statements(app):
    """Eager loading: N classes in a window must not mean N extra statements."""
    from padel_app.helpers.dashboard.coach_home import load_events

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, _, _ = _seed(app, now=now)
    start, end = now - timedelta(days=30), now + timedelta(days=30)

    with app.app_context():
        with _statements(app) as small:
            load_events(coach_id=coach_id, start=start, end=end)

    # Ten more classes for the same coach.
    from padel_app.models import Association_CoachLesson, Club, LessonInstance
    from padel_app.models.lessons import Lesson

    with app.app_context():
        club = Club.query.first()
        for i in range(10):
            s = now + timedelta(days=2, hours=i)
            lesson = Lesson(title=f"More {i}", start_datetime=s, end_datetime=s + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
            db.session.add(LessonInstance(lesson_id=lesson.id, start_datetime=s, end_datetime=s + timedelta(hours=1),
                                          max_players=4, status="scheduled", original_lesson_occurence_date=s.date()))
        db.session.commit()

    with app.app_context():
        with _statements(app) as big:
            events = load_events(coach_id=coach_id, start=start, end=end)

    assert len(events) >= 12
    assert len(big) == len(small), f"{len(small)} statements for 3 classes, {len(big)} for 13"


def test_the_coach_home_runs_the_pipeline_once(app, monkeypatch):
    from padel_app.helpers.dashboard import coach as coach_module
    from padel_app.helpers.dashboard import coach_home
    from padel_app.models.coaches import Coach

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)

    calls = []
    real = coach_home.load_events

    def counting(**kwargs):
        calls.append(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(coach_home, "load_events", counting)
    monkeypatch.setattr(coach_module, "club_now_naive", lambda: now)  # PAD-256: the dashboard clock

    with app.app_context():
        blocks = coach_module.build_coach_dashboard_blocks(coach=db.session.get(Coach, coach_id), user_id=user_id)

    assert len(calls) == 1
    assert [b["type"] for b in blocks] == ["next_class", "needs_you", "schedule_7d", "week_pulse"]
    # The blocks are the same as when each loads its own window.
    with app.app_context():
        separately = [
            coach_home.build_next_class_block(coach_id=coach_id, now=now),
            coach_home.build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now),
            coach_home.build_schedule_block(coach_id=coach_id, now=now),
            coach_home.build_week_pulse_block(coach_id=coach_id, now=now),
        ]
    assert blocks == separately


def test_reply_queue_is_capped_and_one_per_conversation(app):
    from padel_app.helpers.dashboard.coach_home import QUEUE_REPLY_LIMIT, reply_items
    from padel_app.models import Conversation, ConversationParticipant, Message, User

    now = datetime(2026, 8, 4, 10, 0)
    _, user_id, _ = _seed(app, now=now)

    with app.app_context():
        # Six conversations, each with three unread messages from the other side.
        for c in range(6):
            other = User(name=f"Sender {c}", username=f"ch_s{c}", password="x")
            db.session.add(other)
            db.session.flush()
            conv = Conversation(participant_key=Conversation.build_participant_key([user_id, other.id]), is_group=False)
            db.session.add(conv)
            db.session.flush()
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=user_id))
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=other.id))
            for m in range(3):
                db.session.add(Message(text=f"c{c} m{m}", sender_id=other.id, conversation_id=conv.id,
                                       sent_at=now - timedelta(minutes=60 * c + (2 - m))))
        db.session.commit()

    with app.app_context():
        with _statements(app) as stmts:
            items = reply_items(user_id=user_id)

    assert len(items) == QUEUE_REPLY_LIMIT
    # Newest conversation first, and the newest message of each.
    assert items[0]["personName"] == "Sender 0" and items[0]["preview"] == "c0 m2"
    assert len({i["id"] for i in items}) == QUEUE_REPLY_LIMIT
    assert len(stmts) == 1
    assert "LIMIT" in stmts[0].upper()
