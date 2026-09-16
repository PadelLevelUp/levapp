"""
PAD-279 (audit M21) — NotificationConfig stores every scalar setting in a typed
column; the wire shape of GET|POST /api/app/notify/config does not change
(notifications.config rule 12 and its two criteria).

Three things are pinned here:
1. the model: typed columns with defaults, the `restrictions` / `reminder_timing`
   / `invitation_start_timing` Python properties that compose and decompose the
   old dict shapes, and `[]` invitation groups meaning the built-in groups;
2. the API: the same camelCase payload as before, without `rounds`;
3. the migration's backfill mapping, as a pure function on the old JSON blobs,
   including blobs that do not parse.
"""
import importlib.util
import json
import pathlib
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


# ---------------------------------------------------------------------------
# 1. model
# ---------------------------------------------------------------------------

def _coach_id(app, username="p279"):
    from padel_app.models import Coach, User

    user = User(name=username, username=username, email=f"{username}@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id, approval_status="approved")
    db.session.add(coach)
    db.session.flush()
    return coach.id

def test_a_fresh_config_reads_the_old_defaults_from_typed_columns(app):
    from padel_app.models.notification_config import (
        DEFAULT_INVITATION_GROUPS,
        DEFAULT_INVITATION_START_TIMING,
        DEFAULT_REMINDER_TIMING,
        DEFAULT_RESTRICTIONS,
        NotificationConfig,
    )

    with app.app_context():
        cfg = NotificationConfig(coach_id=_coach_id(app))
        db.session.add(cfg)
        db.session.commit()
        db.session.refresh(cfg)

        assert cfg.get_restrictions() == DEFAULT_RESTRICTIONS
        assert cfg.get_reminder_timing() == DEFAULT_REMINDER_TIMING
        assert cfg.get_invitation_start_timing() == DEFAULT_INVITATION_START_TIMING
        assert cfg.get_reminder_count() == 1
        assert cfg.get_hours_between_reminders() == 24
        assert cfg.get_cancellation_deadline_hours() == 24
        assert cfg.get_invitation_groups() == DEFAULT_INVITATION_GROUPS
        assert cfg.schema_version == 1
        assert not hasattr(cfg, "rounds")
        assert not hasattr(cfg, "get_rounds")
        # The typed columns exist and carry the defaults.
        assert cfg.reminder_type == "hours_before" and cfg.reminder_value == 48
        assert cfg.invitation_start_type == "hours_before" and cfg.invitation_start_value == 24
        assert cfg.max_simultaneous_enabled is True and cfg.max_simultaneous_value == 3
        assert cfg.quiet_hours_enabled is False
        assert cfg.excluded_player_ids == []


def test_the_dict_properties_decompose_into_columns_and_compose_back(app):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig(
            coach_id=_coach_id(app),
            restrictions={
                "maxSimultaneous": {"enabled": True, "value": 5},
                "quietHours": {"enabled": True},
                "excludedPlayers": {"enabled": True, "playerIds": ["7", "9"]},
                "cancellationDeadlineHours": 12,
            },
            reminder_timing={
                "firstReminder": {"type": "days_before", "days": 1, "time": "09:30"},
                "reminderCount": 2,
                "hoursBetweenReminders": 6,
                "invitationStart": {"type": "hours_before", "value": 2},
            },
        )
        db.session.add(cfg)
        db.session.commit()
        db.session.refresh(cfg)

        assert cfg.max_simultaneous_value == 5
        assert cfg.quiet_hours_enabled is True
        assert cfg.excluded_players_enabled is True
        assert cfg.excluded_player_ids == ["7", "9"]
        assert cfg.cancellation_deadline_hours == 12
        assert cfg.reminder_type == "days_before"
        assert cfg.reminder_value == 1
        assert cfg.reminder_time == "09:30"
        assert cfg.reminder_count == 2
        assert cfg.hours_between_reminders == 6
        assert cfg.invitation_start_type == "hours_before"
        assert cfg.invitation_start_value == 2

        # Keys the coach did not send read as the defaults, as the old
        # merge-over-defaults getter did.
        r = cfg.get_restrictions()
        assert r["maxSimultaneous"] == {"enabled": True, "value": 5}
        assert r["maxTotal"] == {"enabled": True, "value": 10}
        assert r["quietHours"] == {"enabled": True}
        assert r["excludedPlayers"] == {"enabled": True, "playerIds": ["7", "9"]}
        assert r["excludeUnpaidSubscription"] == {"enabled": False}
        assert r["cancellationDeadlineHours"] == 12
        assert cfg.get_reminder_timing() == {"type": "days_before", "days": 1, "time": "09:30"}
        assert cfg.get_invitation_start_timing() == {"type": "hours_before", "value": 2}
        assert cfg.reminder_timing == {
            "firstReminder": {"type": "days_before", "days": 1, "time": "09:30"},
            "reminderCount": 2,
            "hoursBetweenReminders": 6,
            "invitationStart": {"type": "hours_before", "value": 2},
        }

        # A flat legacy reminder_timing (no firstReminder wrapper) still sets
        # the first reminder, and invitation_start_timing is a setter too.
        cfg.reminder_timing = {"type": "hours_before", "value": 12}
        cfg.invitation_start_timing = {"type": "days_before", "days": 2, "time": "18:00"}
        assert cfg.get_reminder_timing() == {"type": "hours_before", "value": 12}
        assert cfg.get_invitation_start_timing() == {"type": "days_before", "days": 2, "time": "18:00"}
        assert cfg.reminder_count == 2  # untouched by a flat first-reminder write


def test_empty_invitation_groups_mean_the_built_in_groups(app):
    from padel_app.models.notification_config import DEFAULT_INVITATION_GROUPS, NotificationConfig
    from padel_app.services.notification_service import invitation_waves

    with app.app_context():
        cfg = NotificationConfig(coach_id=1, invitation_groups=[])
        assert cfg.get_invitation_groups() == DEFAULT_INVITATION_GROUPS
        waves = invitation_waves(cfg)
        assert [w[1] for w in waves] == ["group", "group", "group"]
        assert [len(w[2]) for w in waves] == [2, 1, 0]


# ---------------------------------------------------------------------------
# 2. API
# ---------------------------------------------------------------------------

def _coach(app):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User(name="Ana", username="p279coach", email="p279@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach)
        db.session.commit()
        app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}


def test_the_config_api_keeps_its_shape_and_drops_rounds(client, app):
    headers = _coach(app)
    res = client.get("/api/app/notify/config", headers=headers)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert "rounds" not in body
    assert body["restrictions"]["maxSimultaneous"] == {"enabled": True, "value": 3}
    assert body["restrictions"]["cancellationDeadlineHours"] == 24
    assert body["reminderTiming"]["firstReminder"] == {"type": "hours_before", "value": 48}
    assert body["reminderTiming"]["invitationStart"] == {"type": "hours_before", "value": 24}
    assert body["reminderTiming"]["reminderCount"] == 1
    assert body["reminderTiming"]["hoursBetweenReminders"] == 24

    res = client.post(
        "/api/app/notify/config",
        headers=headers,
        json={
            "restrictions": {"maxSimultaneous": {"enabled": False, "value": 3},
                             "cancellationDeadlineHours": 6},
            "reminderTiming": {"firstReminder": {"type": "hours_before", "value": 24},
                               "reminderCount": 3, "hoursBetweenReminders": 12,
                               "invitationStart": {"type": "hours_before", "value": 4}},
            "invitationGroups": [],
        },
    )
    assert res.status_code == 200, res.get_json()
    body = client.get("/api/app/notify/config", headers=headers).get_json()
    assert body["restrictions"]["maxSimultaneous"] == {"enabled": False, "value": 3}
    assert body["restrictions"]["cancellationDeadlineHours"] == 6
    assert body["restrictions"]["maxTotal"] == {"enabled": True, "value": 10}
    assert body["reminderTiming"] == {
        "firstReminder": {"type": "hours_before", "value": 24},
        "reminderCount": 3,
        "hoursBetweenReminders": 12,
        "invitationStart": {"type": "hours_before", "value": 4},
    }
    # [] reads back as the built-in three groups: the wire shows what runs
    # (notifications.config rule 12), the same waves the removed `rounds`
    # fallback produced.
    from padel_app.models.notification_config import DEFAULT_INVITATION_GROUPS
    assert body["invitationGroups"] == DEFAULT_INVITATION_GROUPS


# ---------------------------------------------------------------------------
# 3. the migration's backfill mapping
# ---------------------------------------------------------------------------

def _migration():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    path = next(versions.glob("*_pad279_*.py"))
    spec = importlib.util.spec_from_file_location("pad279_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_backfill_maps_the_old_blobs_to_typed_values():
    mod = _migration()
    values, problems = mod.typed_from_json(
        reminder_timing=json.dumps({
            "firstReminder": {"type": "days_before", "days": 1, "time": "09:00"},
            "reminderCount": "2", "hoursBetweenReminders": 6,
            "invitationStart": {"type": "hours_before", "value": 3},
        }),
        invitation_start_timing=json.dumps({"type": "hours_before", "value": 99}),  # loses to the sub-key
        restrictions=json.dumps({
            "maxSimultaneous": {"enabled": True, "value": 5},
            "quietHours": {"enabled": True},
            "excludedPlayers": {"enabled": True, "playerIds": [7, "9"]},
            "cancellationDeadlineHours": 12,
        }),
    )
    assert problems == []
    assert values["reminder_type"] == "days_before" and values["reminder_value"] == 1
    assert values["reminder_time"] == "09:00"
    assert values["reminder_count"] == 2 and values["hours_between_reminders"] == 6
    assert values["invitation_start_type"] == "hours_before" and values["invitation_start_value"] == 3
    assert values["max_simultaneous_enabled"] is True and values["max_simultaneous_value"] == 5
    assert values["max_total_enabled"] is True and values["max_total_value"] == 10
    assert values["quiet_hours_enabled"] is True
    assert values["excluded_players_enabled"] is True
    assert values["excluded_player_ids"] == ["7", "9"]
    assert values["cancellation_deadline_hours"] == 12
    assert values["exclude_inactive_accounts"] is False


def test_backfill_uses_the_column_alone_when_the_sub_key_is_absent():
    mod = _migration()
    values, problems = mod.typed_from_json(
        reminder_timing=json.dumps({"type": "hours_before", "value": 12}),  # flat legacy shape
        invitation_start_timing=json.dumps({"type": "days_before_at_time", "days": 2, "time": "18:00"}),
        restrictions=None,
    )
    assert problems == []
    assert values["reminder_type"] == "hours_before" and values["reminder_value"] == 12
    assert values["invitation_start_type"] == "days_before_at_time"
    assert values["invitation_start_value"] == 2 and values["invitation_start_time"] == "18:00"
    assert values["reminder_count"] == 1


def test_backfill_keeps_defaults_for_a_blob_that_does_not_parse():
    mod = _migration()
    values, problems = mod.typed_from_json(
        reminder_timing="{not json",
        invitation_start_timing=json.dumps(["a", "list"]),
        restrictions=json.dumps({"maxSimultaneous": {"enabled": "yes", "value": "many"},
                                 "cancellationDeadlineHours": -5}),
    )
    # Unreadable parts fall back to the old getters' defaults; readable parts survive.
    assert values["reminder_type"] == "hours_before" and values["reminder_value"] == 48
    assert values["invitation_start_type"] == "hours_before" and values["invitation_start_value"] == 24
    assert values["max_simultaneous_enabled"] is True and values["max_simultaneous_value"] == 3
    assert values["cancellation_deadline_hours"] == 24
    assert values["max_total_enabled"] is True
    assert len(problems) >= 3
    assert any("reminder_timing" in p for p in problems)


def test_backfill_keeps_the_counts_of_a_timing_the_scheduler_could_not_fire_and_reads_loose_booleans():
    """Review findings 1 and 2 on PR #208: the degenerate dict is logged, not silent,
    and its counts survive; 0/1 and "true"/"false" booleans are read, not reset."""
    mod = _migration()
    values, problems = mod.typed_from_json(
        reminder_timing=json.dumps({"reminderCount": 2, "hoursBetweenReminders": 6}),
        invitation_start_timing=None,
        restrictions=json.dumps({
            "maxSimultaneous": {"enabled": 1, "value": 5},
            "maxTotal": {"enabled": "false", "value": 10},
            "quietHours": {"enabled": "TRUE"},
            "excludeUnpaidSubscription": {"enabled": 0},
        }),
    )
    assert values["reminder_type"] == "none"  # fired nothing before, fires nothing after
    assert values["reminder_count"] == 2 and values["hours_between_reminders"] == 6
    assert any("no firstReminder/type" in p for p in problems)
    assert values["max_simultaneous_enabled"] is True and values["max_simultaneous_value"] == 5
    assert values["max_total_enabled"] is False
    assert values["quiet_hours_enabled"] is True
    assert values["exclude_inactive_accounts"] is False
    assert not any("enabled" in p for p in problems)


def test_the_restrictions_setter_reads_loose_booleans_too(app):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig(coach_id=1, restrictions={
            "maxSimultaneous": {"enabled": "false", "value": 3},
            "quietHours": {"enabled": 1},
        })
        assert cfg.max_simultaneous_enabled is False
        assert cfg.quiet_hours_enabled is True


def test_a_none_reminder_timing_reads_back_as_none_and_schedules_nothing(app):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.scheduler import _fire_time_utc

    with app.app_context():
        cfg = NotificationConfig(coach_id=1)
        cfg.reminder_type = "none"
        assert cfg.get_reminder_timing() == {"type": "none"}
        assert cfg.reminder_timing["firstReminder"] == {"type": "none"}
        assert _fire_time_utc(datetime(2026, 9, 20, 10, 0), cfg.get_reminder_timing()) is None
        # Picking a real timing again works as before.
        cfg.reminder_timing = {"firstReminder": {"type": "hours_before", "value": 24}}
        assert cfg.get_reminder_timing() == {"type": "hours_before", "value": 24}


def test_a_flat_reminder_timing_with_counts_keeps_its_counts(app):
    """Batch-4 regression (Session E, US-REM-08 / PAD-49): the reminders form and
    tests may POST the FLAT shape {type, value, reminderCount, hoursBetweenReminders};
    before #208 get_reminder_count() read reminderCount off the stored dict whatever
    its shape, so the count must survive the flat branch of the setter too."""
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig(coach_id=1)
        cfg.reminder_timing = {"type": "hours_before", "value": 48, "reminderCount": 2, "hoursBetweenReminders": 1,
                               "invitationStart": {"type": "hours_before", "value": 3}}
        assert cfg.get_reminder_timing() == {"type": "hours_before", "value": 48}
        assert cfg.get_reminder_count() == 2
        assert cfg.get_hours_between_reminders() == 1
        assert cfg.get_invitation_start_timing() == {"type": "hours_before", "value": 3}
