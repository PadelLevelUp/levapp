"""PAD-723 (PAD-669 R4; notifications.waiting-list rule 4): inside group 0 the order is the coach's own
priority criteria — the same `_rank_invited` the other groups use — and a student's origin
(standing list, series, own request) gives no priority. Join time is only the last tie-breaker.

Before PAD-723 group 0 went strictly by join time, and a row fanned out by a standing entry took the
standing entry's (earlier) creation time: the origin decided.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad446_waiting_list_group_zero import NOW, _entry, _invites, _io, _seed, _standing, _trigger


def _attendance(coach_id, instance_id, player_id, present, absent):
    """`present` + `absent` past classes of this coach for the player (attendance = present / total)."""
    from padel_app.models import Presence
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance

    base = db.session.get(LessonInstance, instance_id)
    for i, status in enumerate(["present"] * present + ["absent"] * absent):
        start = base.start_datetime - timedelta(days=7 * (i + 1))
        past = LessonInstance(lesson_id=base.lesson_id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=base.max_players, status="completed", level_id=base.level_id)
        db.session.add(past)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=past.id))
        db.session.add(Presence(player_id=player_id, lesson_instance_id=past.id, invited=True, confirmed=True,
                                status=status, enrolment_source="coach"))
    db.session.commit()


def _rank_by_attendance(coach_id):
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.priority_criteria = [{"id": "attendance", "label": "Attendance", "enabled": True}]
    db.session.commit()


def test_the_coachs_criteria_order_group_0_not_the_join_time(app, monkeypatch):
    """Ana joined the list first but comes 1 in 4; Bea joined later and comes 4 in 4. With the coach
    ranking by attendance and one invitation at a time, Bea is asked first."""
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (ana, bea) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        _rank_by_attendance(coach_id)
        _attendance(coach_id, instance_id, ana, present=1, absent=3)
        _attendance(coach_id, instance_id, bea, present=4, absent=0)
        _entry(instance_id, coach_id, ana, NOW - timedelta(hours=4))
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1))
        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(bea, 0)]


def test_a_standing_entrys_age_gives_no_priority(app, monkeypatch):
    """Equal attendance: Ana's own row joined at 10:00; Bea's row was fanned out at 11:00 by a standing
    entry created at 09:00. The origin gives nothing, so the rows' own times decide: Ana first."""
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (ana, bea) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        _entry(instance_id, coach_id, ana, NOW - timedelta(hours=4))
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=3),
               standing=_standing(coach_id, bea, NOW - timedelta(hours=5)))
        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(ana, 0)]
