"""PAD-844 (notifications.waiting-list rule 2a, the owner's decision 2026-11-14): the standing list gives
no priority in a class whose bar the student fails, even after the coach confirmed the warning; where
they pass, it asks them. A coach's add to one class skips the bar on the new engine (the coach's list,
engine-tiers rule 4); the old engine applies the bar to every waiting-list row (rule 4a).

Each test runs one setup on both engines: the class's bar is "same level as the class". On the old
engine the class is ``test_pad128_eligibility``'s (level "5"; "5-" is one below); on the new engine it is
``test_pad916_engine_store``'s, with the student moved down a rung by ``_below_the_bar``. The old engine's
answer is group 0 (``_waiting_list_candidates``), the new engine's the tier the planner gives the
student for the open spot.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad916_engine_store import NOW, _seed
from padel_app.tests.test_pad932_manual_engine_invitation import _below_the_bar

SAME_LEVEL = [{"attribute": "level", "operation": "same_as_class"}]


def _standing(coach_id, player_id, instance_id, *, expires_at, lesson_id=None):
    """A standing entry (coach-wide, or scoped to ``lesson_id``'s series) and the row it fanned out."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry

    entry = StandingWaitingListEntry(coach_id=coach_id, player_id=int(player_id), expires_at=expires_at,
                                     lesson_id=lesson_id, is_active=True)
    db.session.add(entry)
    db.session.flush()
    db.session.add(WaitingListEntry(lesson_instance_id=int(instance_id), player_id=int(player_id), coach_id=coach_id,
                                    standing_entry_id=entry.id, is_active=True))


def _coach_add(coach_id, player_id, instance_id):
    """The coach's add to this one class (rule 18): ``added_by`` coach, no standing entry."""
    from padel_app.models.waiting_list_entry import WaitingListEntry

    db.session.add(WaitingListEntry(lesson_instance_id=int(instance_id), player_id=int(player_id), coach_id=coach_id,
                                    added_by="coach", is_active=True))


def _old_group_0(app, setup):
    """The old engine: ``setup(coach_id, instance, level_ids, add_student)`` places the rows; returns
    the player ids in group 0 for an open spot of the class's level and ``setup``'s return value."""
    from padel_app.tests.test_pad128_eligibility import _add_student, _seed as _seed_old

    ids = _seed_old(app, eligibility_rules=SAME_LEVEL)
    with app.app_context():
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.notification_config import NotificationConfig
        from padel_app.models.vacancy import Vacancy
        from padel_app.services.notification_service import _waiting_list_candidates

        coach = ids["coach_id"]
        inst = db.session.get(LessonInstance, ids["instance_id"])
        named = setup(coach, inst, ids["level_ids"], _add_student)
        db.session.add(Vacancy(lesson_instance_id=inst.id, coach_id=coach, status="open",
                               level_id=ids["level_ids"]["5"]))
        db.session.commit()
        config = NotificationConfig.query.filter_by(coach_id=coach).first()
        inst = db.session.get(LessonInstance, ids["instance_id"])
        vacancy = Vacancy.query.filter_by(lesson_instance_id=inst.id).first()
        return {e.player_id for e, _ in _waiting_list_candidates(vacancy, inst, coach, config, dry_run=True)}, named


def _new_tiers(app, monkeypatch, players, setup):
    """The new engine: ``setup(store, session, coach_id, students)`` places the rows; returns, per
    student, ``(in pool, tier source or None)`` for the open spot, and the session's lesson id."""
    pin_clock(monkeypatch, NOW)
    from padel_app.invitation_engine import planner
    from padel_app.services.engine_store import TableStore, settings_for
    from padel_app.services.notification_service import get_or_create_config

    store, (s,), pids = _seed(app, players=players, side="right", capacity=2)
    coach = store.coach_of(s)
    get_or_create_config(coach).eligibility_rules = SAME_LEVEL
    setup(store, s, coach, pids[1:])
    db.session.commit()
    snap = TableStore(clock=lambda: NOW).snapshot(s)
    settings = settings_for(s)
    counts = planner.spot_counts(snap, settings)
    [(spot_type, _)] = planner.spot_types(snap, counts)
    pool = {st.id for st in snap.pool}
    out = {}
    for sid in pids[1:]:
        t = planner.tier_for(snap.students[sid], spot_type, counts, snap, settings)
        out[sid] = (sid in pool, settings.tiers[t].source if t is not None else None)
    return out


def _lesson_of(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session)).lesson_id


@pytest.mark.criterion("NOTIFICATIONS-WAITING-LIST-45")
def test_a_standing_row_asks_an_eligible_student_on_both_engines(app, monkeypatch):
    def old_setup(coach, inst, levels, add_student):
        student = add_student(coach, "at_level", levels["5"])
        _standing(coach, student, inst.id, expires_at=datetime(2099, 1, 1))
        return student

    group_0, student = _old_group_0(app, old_setup)
    assert student in group_0

    with app.app_context():
        def new_setup(store, s, coach, students):
            _standing(coach, students[0], s, expires_at=NOW + timedelta(days=30))

        assert list(_new_tiers(app, monkeypatch, 2, new_setup).values()) == [(True, "students_list")]


@pytest.mark.criterion("NOTIFICATIONS-WAITING-LIST-46")
def test_a_standing_row_never_asks_a_student_below_the_bar_on_both_engines(app, monkeypatch):
    """The coach confirmed the warning (the add went through); the bar still holds in this class, for a
    coach-wide entry and for one scoped to the class's series (rule 19; the lead's reading, D2)."""
    def old_setup(coach, inst, levels, add_student):
        wide, series = add_student(coach, "below_wide", levels["5-"]), add_student(coach, "below_series", levels["5-"])
        _standing(coach, wide, inst.id, expires_at=datetime(2099, 1, 1))
        _standing(coach, series, inst.id, expires_at=datetime(2099, 1, 1), lesson_id=inst.lesson_id)
        return wide, series

    group_0, (wide, series) = _old_group_0(app, old_setup)
    assert wide not in group_0 and series not in group_0

    with app.app_context():
        def new_setup(store, s, coach, students):
            wide, series = students
            _below_the_bar(store, wide)
            from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
            low = Association_CoachPlayer.query.filter_by(player_id=int(wide)).one().level_id
            Association_CoachPlayer.query.filter_by(player_id=int(series)).one().level_id = low
            _standing(coach, wide, s, expires_at=NOW + timedelta(days=30))
            _standing(coach, series, s, expires_at=NOW + timedelta(days=30), lesson_id=_lesson_of(s))

        assert list(_new_tiers(app, monkeypatch, 3, new_setup).values()) == [(False, None), (False, None)]


@pytest.mark.criterion("NOTIFICATIONS-WAITING-LIST-47")
def test_a_coach_add_for_one_class_skips_the_bar_on_the_new_engine_only(app, monkeypatch):
    def old_setup(coach, inst, levels, add_student):
        student = add_student(coach, "below_added", levels["5-"])
        _coach_add(coach, student, inst.id)
        return student

    group_0, student = _old_group_0(app, old_setup)
    assert student not in group_0                      # rule 4a: the old engine's bar holds for every row

    with app.app_context():
        def new_setup(store, s, coach, students):
            _below_the_bar(store, students[0])
            _coach_add(coach, students[0], s)

        assert list(_new_tiers(app, monkeypatch, 2, new_setup).values()) == [(False, "coach_list")]
