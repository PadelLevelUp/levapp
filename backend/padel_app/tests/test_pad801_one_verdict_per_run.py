"""
PAD-801 — within one engine run a student's rule verdict is computed once per spot shape, and a
class at its `maxTotal` budget holds its spots instead of moving their rounds on
(notifications.invitations rules 3e and 12b).

1. When a class opens several spots, `evaluate_candidates` runs once per spot and group. The only
   per-spot inputs to the group rules are the spot's side and level, and the eligibility bar and
   the student's auto-invite preference do not read the spot at all. So one engine run (a tick of
   `process_invitation_batches`, or one `trigger_invitations` call) evaluates each student's group
   rules once per (side, level, group), and the bar and the preference once per class. The
   invitations are the same as before: same students, same spots.

2. The budget is checked before anyone is evaluated. Before PAD-801 an empty round inside
   `trigger_invitations`' loop (after an earlier spot used up the budget) or in a decline's
   follow-up advanced the round although nobody could be invited; the tick already held such a
   spot (its `_check_restrictions` refuses the class first).
"""
import json
from collections import Counter
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import (
    PATCHES,
    _create_coach,
    _create_coach_player,
    _create_instance,
    _create_level,
    _create_player,
    _create_user,
)


def _coach_and_class(suffix, *, n_spots, max_total=None, groups, bar=None, max_sim=1):
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.notification_config import NotificationConfig

    coach = _create_coach(_create_user("Coach", f"pad801coach{suffix}"))
    level = _create_level(coach, label="L1", code="L1")
    other = CoachLevel(coach_id=coach.id, label="L2", code="L2", display_order=2)
    db.session.add(other)
    db.session.flush()
    instance = _create_instance(coach, level, start_offset_hours=48, max_players=n_spots)
    restrictions = {"maxSimultaneous": {"enabled": True, "value": max_sim}}
    if max_total is not None:
        restrictions["maxTotal"] = {"enabled": True, "value": max_total}
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_groups=groups,
        eligibility_rules=bar or [], restrictions=restrictions,
    ))
    db.session.commit()
    return coach, instance, level, other


def _student(coach, suffix, i, level, side):
    p = _create_player(_create_user(f"S{i}", f"pad801s{suffix}{i}"))
    cp = _create_coach_player(coach, p, level=level)
    cp.side = side
    return p


def _spot(coach, instance, *, side=None, level=None, started=False, round_no=1):
    from padel_app.models.vacancy import Vacancy

    v = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open", side=side,
                level_id=level.id if level else None, current_round_number=round_no,
                current_batch_number=1 if started else 0,
                last_activity_at=datetime.utcnow() - timedelta(minutes=5) if started else None,
                # The invitation window is open (rule 11a), so the tick does not hold the spot.
                invite_not_before=datetime.utcnow() - timedelta(hours=1))
    db.session.add(v)
    db.session.flush()
    return v


# --- 1. one verdict per (side, level, group) and per class, the same invitations -------------

GROUPS = [
    {"id": "1", "rules": [{"attribute": "side", "operation": "same_as_vacancy"},
                          {"attribute": "level", "operation": "same_as_vacancy"}]},
]
BAR = [{"attribute": "unjustified_absences", "operation": "less_than", "value": 3}]


def _count_rule_checks():
    """Wrap the one rule evaluator: group-rule checks keyed by (spot side, spot level, rules,
    student), bar checks keyed by student; and the auto-invite preference reads by student.
    The bar re-check under the class lock (`_still_invitable`, just before an invitation is
    written) stays fresh on purpose and is not counted here."""
    from padel_app.services import notification_service as ns
    from padel_app.services import student_notification_preferences as prefs_mod

    groups, bars, prefs = Counter(), Counter(), Counter()
    real_rules, real_pref = ns._group_rule_failures, prefs_mod.player_blocks_auto_invitations
    real_still = ns._still_invitable
    under_lock = []

    def still(*a, **k):
        under_lock.append(1)
        try:
            return real_still(*a, **k)
        finally:
            under_lock.pop()

    def rules(rule_list, cp, vacancy, coach_id, instance=None, **kw):
        if vacancy is None:
            if not under_lock:
                bars[cp.player_id] += 1
        else:
            level_id, _ = ns._vacancy_level(vacancy, instance)
            groups[(vacancy.side, level_id, json.dumps(rule_list, sort_keys=True), cp.player_id)] += 1
        return real_rules(rule_list, cp, vacancy, coach_id, instance, **kw)

    def pref(player_id):
        prefs[player_id] += 1
        return real_pref(player_id)

    patches = (patch.object(ns, "_group_rule_failures", rules),
               patch.object(prefs_mod, "player_blocks_auto_invitations", pref),
               patch.object(ns, "_still_invitable", still))
    return groups, bars, prefs, patches


def test_one_trigger_evaluates_each_student_once_per_spot_shape_and_invites_the_same(app):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns

    with app.app_context():
        coach, instance, level, _ = _coach_and_class("a", n_spots=4, groups=GROUPS, bar=BAR)
        students = [_student(coach, "a", i, level, "left" if i % 2 == 0 else "right") for i in range(8)]
        spots = [_spot(coach, instance, side=s, level=level) for s in ("left", "left", "right", "right")]
        db.session.commit()

        groups, bars, prefs, (p_rules, p_pref, p_still) = _count_rule_checks()
        with p_rules, p_pref, p_still, patch(PATCHES[0]), patch(PATCHES[1]):
            ns.trigger_invitations(instance, coach.id)

        # The same invitations as before PAD-801: each spot asked one student of its side, in
        # roster order, and no student holds two offers of the class (rule 18).
        index = {p.id: i for i, p in enumerate(students)}
        spot_no = {v.id: i for i, v in enumerate(spots)}
        sent = sorted((spot_no[e.vacancy_id], index[e.player_id])
                      for e in NotificationEvent.query.filter_by(lesson_instance_id=instance.id))
        assert sent == [(0, 0), (1, 2), (2, 1), (3, 3)], sent

        # Two spot shapes (left and right at L1), one group: each student checked once per shape.
        assert groups and max(groups.values()) == 1, sorted(groups.values())
        assert len({k[:3] for k in groups}) == 2
        # The bar and the preference do not read the spot: once per student for the class.
        assert bars and max(bars.values()) == 1, sorted(bars.values())
        assert prefs and max(prefs.values()) == 1, sorted(prefs.values())


def test_a_tick_evaluates_each_student_once_per_spot_shape(app):
    """The tick's later rounds (`_send_batch_locked`) share the run too."""
    from padel_app.services import notification_service as ns

    with app.app_context():
        nobody = [{"id": "1", "rules": [{"attribute": "level", "operation": "one_above_vacancy"}]},
                  {"id": "2", "rules": [{"attribute": "level", "operation": "one_above_vacancy"}]}]
        coach, instance, level, _ = _coach_and_class("b", n_spots=4, groups=nobody, bar=BAR)
        for i in range(6):
            _student(coach, "b", i, level, "left")
        for s in ("left", "left", "right", "right"):
            # Started, round 2 reached by an empty round 1: the tick sends round 2 now (rule 3c).
            _spot(coach, instance, side=s, level=level, started=True, round_no=2)
        db.session.commit()

        groups, bars, prefs, (p_rules, p_pref, p_still) = _count_rule_checks()
        with p_rules, p_pref, p_still, patch(PATCHES[0]), patch(PATCHES[1]):
            ns.process_invitation_batches(now=datetime.utcnow())

        assert groups and max(groups.values()) == 1, sorted(groups.values())
        assert bars and max(bars.values()) == 1, sorted(bars.values())
        assert prefs and max(prefs.values()) == 1, sorted(prefs.values())


# --- 2. an exhausted budget holds the spot ---------------------------------------------------

BY_LEVEL = [{"id": "1", "rules": [{"attribute": "level", "operation": "same_as_vacancy"}]},
            {"id": "2", "rules": []}]


def test_a_spot_after_the_budget_ran_out_in_the_same_trigger_holds_its_round(app):
    """maxTotal 1: the first spot invites the one L1 student; the second spot (level L2) has
    nobody in group 1. Its round stays 1 and its start is given back, as on the tick."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    with app.app_context():
        coach, instance, level, other = _coach_and_class("c", n_spots=2, max_total=1, groups=BY_LEVEL)
        _student(coach, "c", 0, level, "left")
        first = _spot(coach, instance, level=level)
        second = _spot(coach, instance, level=other)
        db.session.commit()

        with patch(PATCHES[0]), patch(PATCHES[1]):
            sent = ns.trigger_invitations(instance, coach.id)

        assert len(sent) == 1
        db.session.expire_all()
        second = Vacancy.query.get(second.id)
        assert second.status == "open"
        assert second.current_round_number == 1, "an exhausted budget must not move the round on"
        assert second.last_activity_at is None, "the start is given back, retried on a later tick"
        assert Vacancy.query.get(first.id).current_round_number == 1


def test_a_decline_follow_up_at_the_budget_holds_its_round(app):
    """maxTotal 1, already used by another spot's live invitation; a started spot whose group 1
    matches nobody is asked for its next student after a decline. Nothing can be sent, so its
    round stays where it is."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    with app.app_context():
        coach, instance, level, other = _coach_and_class("d", n_spots=2, max_total=1, groups=BY_LEVEL)
        p = _student(coach, "d", 0, level, "left")
        first = _spot(coach, instance, level=level, started=True)
        second = _spot(coach, instance, level=other, started=True)
        db.session.add(NotificationEvent(coach_id=coach.id, lesson_instance_id=instance.id,
                                         player_id=p.id, vacancy_id=first.id, type="auto",
                                         round_number=1, status="sent"))
        db.session.commit()

        with patch(PATCHES[0]), patch(PATCHES[1]):
            ns._send_next_on_decline(second, instance, coach.id, ns.get_or_create_config(coach.id))

        db.session.expire_all()
        second = Vacancy.query.get(second.id)
        assert second.status == "open"
        assert second.current_round_number == 1, "an exhausted budget must not move the round on"
