"""notifications.config rule 19 (PAD-913): what a new-engine coach's stored configuration does to the
engine. The store's half here (PAD-916): a session the coach or class turned off is never listed
(CONFIG-54); the app's gates on the pool (CONFIG-53) are in ``test_pad916_engine_store.py``. The mapping to
``EngineSettings`` (CONFIG-52, CONFIG-55) is ``engine_store.settings_for`` (PAD-917).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import START, _seed


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-54")
def test_sessions_turned_off_are_not_listed(app):
    """notifications.config rule 19 (CONFIG-54): the coach's automatic invitations off, or a class's
    own auto_invites or notifications off, and the store lists none of those sessions."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig

    store, (a, b, c), _ = _seed(app, starts=(START, START + timedelta(hours=1), START + timedelta(hours=2)))
    coach_id = store.coach_of(a)
    assert store.sessions() == ()                                   # no config: the coach's switch is off
    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
    db.session.commit()
    assert store.sessions() == (a, b, c)
    db.session.get(LessonInstance, int(b)).auto_invites = False
    db.session.get(LessonInstance, int(c)).notifications_enabled = False
    db.session.commit()
    assert store.sessions() == (a,)
    NotificationConfig.query.filter_by(coach_id=coach_id).one().auto_notify_enabled = False
    db.session.commit()
    assert store.sessions() == ()


# --- The mapping to EngineSettings (PAD-917): engine_store.settings_for -> engine_settings_mapping ----


def _config(**columns):
    from padel_app.models.notification_config import NotificationConfig

    return NotificationConfig(coach_id=1, auto_notify_enabled=True, **columns)


def _settings(config):
    from padel_app.services.engine_settings_mapping import settings_from_config

    return settings_from_config(config)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_stored_values_map_and_off_traps_stay_off():
    """The spec's coach: minTimeBeforeClass off, quietHours off, maxSimultaneous 4 disabled and
    maxInactiveTime 45 minutes. Off is zero and none, never the engine's 2 h and 00:00-07:00."""
    from padel_app.invitation_engine.settings import EngineSettings

    config = _config()
    config.restrictions = {"minTimeBeforeClass": {"enabled": False, "value": 60},
                           "quietHours": {"enabled": False, "start": "23:00", "end": "08:00"},
                           "maxSimultaneous": {"enabled": False, "value": 4},
                           "maxInactiveTime": {"enabled": True, "value": 45}}
    s = _settings(config)
    assert s.last_invite_before == timedelta(0) != EngineSettings().last_invite_before
    assert s.quiet_hours is None and EngineSettings().quiet_hours is not None
    assert s.invites_per_spot == 4
    assert (s.timing.method, s.timing.between_rounds, s.timing.between_groups) == (
        "fixed", timedelta(minutes=45), timedelta(minutes=45))


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_switched_on_restrictions_map_to_their_values():
    """On, the same keys carry the coach's values: minutes before class, the quiet window (its
    stored times, or 22:00-07:00 when none was typed), and maxInactiveTime also when disabled."""
    from datetime import time

    config = _config()
    config.restrictions = {"minTimeBeforeClass": {"enabled": True, "value": 30},
                           "quietHours": {"enabled": True, "start": "23:30", "end": "08:00"},
                           "maxInactiveTime": {"enabled": False, "value": 90}}
    s = _settings(config)
    assert s.last_invite_before == timedelta(minutes=30)
    assert s.quiet_hours == (time(23, 30), time(8, 0))
    assert s.timing.between_rounds == s.timing.between_groups == timedelta(minutes=90)

    config.quiet_hours_start = config.quiet_hours_end = None
    assert _settings(config).quiet_hours == (time(22, 0), time(7, 0))


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_an_untouched_coach_keeps_today_s_values_not_the_engine_defaults():
    """A config nobody edited maps to today's defaults (X 3, T 120 min, no last-invite cutoff, no
    quiet hours, invitations 24 h before, one reminder 48 h before), not EngineSettings()'s."""
    s = _settings(_config())
    assert s.invites_per_spot == 3
    assert s.timing.between_rounds == timedelta(minutes=120)
    assert (s.last_invite_before, s.quiet_hours) == (timedelta(0), None)
    assert (s.first_invite.type, s.first_invite.hours) == ("hours_before", 24)
    a = s.attendance_request
    assert (a.type, a.hours, a.max, a.every) == ("hours_before", 48, 1, timedelta(hours=24))
    assert s.direct_join is False


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_timing_shapes_map_one_for_one():
    """notifications.engine-settings rule 10: each stored shape maps to the same shape."""
    from datetime import time

    config = _config()
    config.invitation_start_timing = {"type": "days_before_at_time", "days": 2, "time": "19:30"}
    config.reminder_timing = {"firstReminder": {"type": "days_before", "days": 1, "time": "17:00"},
                              "reminderCount": 3, "hoursBetweenReminders": 2.5}
    s = _settings(config)
    assert (s.first_invite.type, s.first_invite.days_before, s.first_invite.at) == (
        "days_before_at_time", 2, time(19, 30))
    a = s.attendance_request
    assert (a.type, a.days_before, a.at, a.max, a.every) == (
        "days_before", 1, time(17, 0), 3, timedelta(hours=2, minutes=30))

    config.invitation_start_timing = {"type": "none"}
    config.reminder_timing = {"firstReminder": {"type": "none"}}
    s = _settings(config)
    assert (s.first_invite.type, s.attendance_request.type) == ("none", "none")


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_auto_accept_join_requests_maps_to_direct_join():
    assert _settings(_config(auto_accept_join_requests=True)).direct_join is True
    assert _settings(_config(auto_accept_join_requests=False)).direct_join is False


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-55")
def test_ordering_is_the_enabled_priority_criteria_then_the_enabled_tiebreakers():
    """Each list in the coach's order, only what is on; a criterion in both lists ranks once, at its
    first place; an id the engine does not know is left out rather than refusing the coach."""
    config = _config(
        priority_criteria=[{"id": "attendance", "enabled": True}, {"id": "level", "enabled": False},
                           {"id": "subscription_status", "enabled": True},
                           {"id": "justified_misses", "enabled": True}, {"id": "retired_id", "enabled": True}],
        tiebreakers=[{"id": "attendance_rate", "enabled": True},
                     {"id": "unjustified_absences", "enabled": False},
                     {"id": "subscription_status", "enabled": True},
                     {"id": "playing_side_match", "enabled": True}])
    assert _settings(config).ordering == ("attendance", "subscription_status", "justified_misses",
                                          "attendance_rate", "playing_side_match")

    # Today's defaults: level, justified_misses, attendance; then the first three tiebreakers.
    assert _settings(_config()).ordering == ("level", "justified_misses", "attendance", "unjustified_absences",
                                             "justified_absences", "attendance_rate")


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-60")
def test_the_engine_bar_is_wide_open():
    """rule 19, swap decision 6: eligibility is the app's (the store's pool), so the engine admits a
    student any number of levels better or worse than the class."""
    from padel_app.invitation_engine.planner import _eligible
    from padel_app.invitation_engine.snapshot import SessionSnapshot, Student

    s = _settings(_config(eligibility_rules=[{"attribute": "level", "operation": "same_as_class"}]))
    session = SessionSnapshot(id="1", level=3, capacity=4, start=START, regulars=(), going=())
    for level in (1, 3, 9, 99):
        assert _eligible(Student(str(level), level, frozenset({"L"})), session, s)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-52")
def test_settings_for_reads_the_session_s_coach_config_at_every_call(app):
    """notifications.engine-settings rule 9: the session's coach's stored values, read again at each
    call; a coach with no row gets today's defaults, and none is created."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_store import settings_for

    store, (a,), _ = _seed(app)
    coach_id = store.coach_of(a)
    assert settings_for(a).invites_per_spot == 3
    assert NotificationConfig.query.filter_by(coach_id=coach_id).count() == 0

    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True)
    config.restrictions = {"maxSimultaneous": {"enabled": True, "value": 5}}
    db.session.add(config)
    db.session.commit()
    assert settings_for(a).invites_per_spot == 5
    config.max_simultaneous_value = 2
    db.session.commit()
    assert settings_for(a).invites_per_spot == 2


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-56")
def test_cancellation_deadline_maps_to_the_absence_cutoff():
    """Swap decision 4: the stored hours are the engine's cutoff (it only marks an absence on time or
    late; the coach judges), never the engine's 12 h default."""
    assert _settings(_config()).absence_cutoff_before == timedelta(hours=24)
    config = _config()
    config.restrictions = {"cancellationDeadlineHours": 6.5}
    assert _settings(config).absence_cutoff_before == timedelta(hours=6, minutes=30)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-57")
def test_invitation_groups_map_to_tiers_one_for_one():
    """Swap decision 5: the two waiting lists, then one pool tier per stored group in the coach's
    order, its side and level taken from its side and level rules, every rule carried as stored."""
    from padel_app.invitation_engine.settings import GroupRule, Tier

    same_level = GroupRule("level", "same_as_vacancy")
    same_side = GroupRule("side", "same_as_vacancy")
    assert _settings(_config()).tiers == (            # the reference groups
        Tier("coach_list"), Tier("students_list"),
        Tier("pool", "same", 0, (same_level, same_side)),
        Tier("pool", "any", 0, (same_level,)),
        Tier("pool", "any", None, ()),
    )

    makeups = {"attribute": "has_makeups", "operation": "is_true"}
    absences = {"attribute": "unjustified_absences", "operation": "less_than", "value": 2}
    config = _config(invitation_groups=[
        {"id": "a", "rules": [makeups, {"attribute": "level", "operation": "one_above_vacancy"}]},
        {"id": "b", "rules": [{"attribute": "level", "operation": "one_below_vacancy"}, absences]},
        {"id": "c", "rules": [{"attribute": "level", "operation": "all_above_vacancy"}]},
    ])
    assert _settings(config).tiers[2:] == (
        Tier("pool", "any", 1, (GroupRule("has_makeups", "is_true"), GroupRule("level", "one_above_vacancy"))),
        Tier("pool", "any", -1, (GroupRule("level", "one_below_vacancy"),
                                 GroupRule("unjustified_absences", "less_than", 2))),
        Tier("pool", "any", None, (GroupRule("level", "all_above_vacancy"),)),
    )


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-59")
def test_every_stored_group_maps_an_unknown_rule_included():
    """No group is refused or rounded: a rule the engine does not know is carried as stored and read
    as today (it passes), and a group with only such a rule sets no side and no level."""
    from padel_app.invitation_engine.settings import GroupRule, Tier

    config = _config(invitation_groups=[
        {"id": "x", "rules": [{"attribute": "shoe_size", "operation": "equals", "value": 42}]},
        {"id": "y", "rules": [{"attribute": "level", "operation": "within_two_of_vacancy"},
                              {"attribute": "side", "operation": "opposite_of_vacancy"}]},
    ])
    assert _settings(config).tiers[2:] == (
        Tier("pool", "any", None, (GroupRule("shoe_size", "equals", 42),)),
        Tier("pool", "any", None, (GroupRule("level", "within_two_of_vacancy"),
                                   GroupRule("side", "opposite_of_vacancy"))),
    )


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-58")
def test_invitation_mode_is_carried():
    """Swap decision 2: semi-automatic is kept; the engine's hold reads the coach's stored mode."""
    assert _settings(_config(invitation_mode="semi_automatic")).invitation_mode == "semi_automatic"
    assert _settings(_config(invitation_mode="automatic")).invitation_mode == "automatic"
    assert _settings(_config()).invitation_mode == "automatic"


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-62")
def test_reminder_count_and_interval_map_to_the_attendance_request():
    config = _config(reminder_count=2, hours_between_reminders=6)
    a = _settings(config).attendance_request
    assert (a.max, a.every) == (2, timedelta(hours=6))
