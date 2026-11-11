"""PAD-815 (notifications.config rule 17, levels.coach-levels rule 14): a new coach starts from the
reference coach's notification configuration and 17-level ladder, on every path that creates a
coach. Carve-outs: evaluation_scale_max stays 5, excluded players off, message_templates NULL (the
built-in texts until the owner approves the reference's). A coach created before the rule reads as
before.

The expected values are written out here on purpose, not imported: they are the documented
defaults, and the test must fail if the code drifts from them.

Run:
    pytest padel_app/tests/test_pad815_new_coach_starts_from_the_reference.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad477_invited_coach_confirms_email import CAPABLE, _body, _invitation
from padel_app.tests.test_email_verification import outbox  # noqa: F401  (fixture)

REFERENCE_LADDER = [
    ("2+", "Nivel 2 alto"), ("2", "Nivel 2"), ("2-", "Nivel 2 baixo"),
    ("3+", "Nivel 3 alto"), ("3", "Nivel 3"), ("3-", "Nivel 3 baixo"),
    ("4+", "Nivel 4 alto"), ("4", "Nivel 4"), ("4-", "Nivel 4 baixo"),
    ("5+", "Nivel 5 alto"), ("5", "Nivel 5"), ("5-", "Nivel 5 baixo"),
    ("6+", "Nivel 6 alto"), ("6", "Nivel 6"), ("6-", "Nivel 6 baixo"),
    ("7+", "Nivel 7 alto"), ("7", "Iniciação"),
]


def _group(n, *rules):
    return {"id": f"default_{n}", "rules": [{"attribute": a, "operation": o} for a, o in rules]}


ONE_ABOVE, SAME = ("level", "one_above_vacancy"), ("level", "same_as_vacancy")
SIDE, MAKEUPS = ("side", "same_as_vacancy"), ("has_makeups", "is_true")

REFERENCE_CONFIG = {
    "auto_notify_enabled": True,
    "invitation_mode": "automatic",
    "auto_accept_join_requests": True,
    "invitation_start_type": "days_before_at_time",
    "invitation_start_value": 2,
    "invitation_start_time": "19:00",
    "reminder_type": "days_before_at_time",
    "reminder_value": 1,
    "reminder_time": "17:00",
    "reminder_count": 3,
    "hours_between_reminders": 2,
    "quiet_hours_enabled": True,
    "quiet_hours_start": "00:00",
    "quiet_hours_end": "07:00",
    "max_simultaneous_enabled": True,
    "max_simultaneous_value": 3,
    "max_total_enabled": True,
    "max_total_value": 10,
    "max_invites_per_student_per_day_enabled": True,
    "max_invites_per_student_per_day_value": 3,
    "no_same_day_class_enabled": True,
    "max_inactive_time_enabled": True,
    "max_inactive_time_value": 60,
    "min_time_before_class_enabled": False,
    "min_time_before_class_value": 125,
    "exclude_inactive_accounts": False,
    "cancellation_deadline_hours": 24,
    "evaluation_reminder_type": "never",
    "evaluation_reminder_value": None,
    "eligibility_rules": [{"value": 2, "attribute": "level", "operation": "within_n_above_class"}],
    "invitation_groups": [
        _group(1, ONE_ABOVE, SIDE, MAKEUPS), _group(2, SAME, SIDE, MAKEUPS),
        _group(3, ONE_ABOVE, SIDE), _group(4, SAME, SIDE),
        _group(5, ONE_ABOVE, MAKEUPS), _group(6, SAME, MAKEUPS),
        _group(7, ONE_ABOVE), _group(8, SAME),
    ],
    "tiebreakers": [
        {"id": "unjustified_absences", "label": "Fewest unjustified absences", "enabled": True},
        {"id": "justified_absences", "label": "Most justified absences", "enabled": True},
        {"id": "attendance_rate", "label": "Highest attendance rate", "enabled": True},
        {"id": "playing_side_match", "label": "Matching playing side", "enabled": True},
        {"id": "subscription_status", "label": "Active subscription", "enabled": False},
    ],
    "notification_groups": [
        {"id": "same_level", "label": "Same level", "enabled": True},
        {"id": "recent_absences", "label": "Recent absences", "enabled": True},
        {"id": "justified_absences", "label": "Justified absences", "enabled": True},
        {"id": "all_students", "label": "All students", "enabled": True},
    ],
    "open_spots_visible": True,
    "priority_criteria": None,
    # The carve-outs (rule 17, "Not taken from the reference").
    "evaluation_scale_max": 5,
    "excluded_players_enabled": False,
    "excluded_player_ids": [],
    "message_templates": None,
}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    app.config["PROPAGATE_EXCEPTIONS"] = False


def _assert_reference(coach_id):
    from padel_app.models import CoachLevel
    from padel_app.models.notification_config import NotificationConfig

    rows = NotificationConfig.query.filter_by(coach_id=coach_id).all()
    assert len(rows) == 1, f"coach {coach_id} has {len(rows)} notification_configs rows"
    got = {key: getattr(rows[0], key) for key in REFERENCE_CONFIG}
    assert got == REFERENCE_CONFIG

    levels = CoachLevel.query.filter_by(coach_id=coach_id).order_by(CoachLevel.display_order).all()
    assert [(l.code, l.label) for l in levels] == REFERENCE_LADDER
    assert [l.display_order for l in levels] == list(range(1, 18))


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-1")
def test_a_coach_made_by_the_service_starts_from_the_reference(app):
    """RED before the fix: no config row, and the L1/L2/L3 ladder."""
    from padel_app.models import User
    from padel_app.services.coach_service import create_coach_service

    with app.app_context():
        user = User(name="New Coach", username="pad815_service", password="pw123")
        db.session.add(user)
        db.session.commit()
        coach = create_coach_service({"user": user.id})
        _assert_reference(coach.id)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-1")
def test_a_coach_who_signs_up_starts_from_the_reference(client, app):
    """RED before the fix: no config row, and the L1/L2/L3 ladder."""
    from padel_app.models import Coach, User

    body = {
        "role": "coach", "name": "Rui Costa", "username": "pad815_signup", "email": "pad815@example.com",
        "password": "Segura123", "birthDate": "2000-01-01", "country": "PT",
    }
    res = client.post("/api/auth/register", json=body)
    assert res.status_code in (200, 201), res.get_json()
    with app.app_context():
        user = User.query.filter_by(username="pad815_signup").one()
        _assert_reference(Coach.query.filter_by(user_id=user.id).one().id)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-1")
def test_a_coach_who_accepts_a_club_invitation_starts_from_the_reference(client, app, outbox):
    """RED before the fix: no config row, and the L1/L2/L3 ladder."""
    from padel_app.models import Coach, User

    token, _club_id = _invitation(app)
    res = client.post(
        f"/api/app/coach-invitations/{token}/accept",
        json=_body(username="pad815_invited", email="pad815_invited@example.com"),
        headers=CAPABLE,
    )
    assert res.status_code in (200, 201), res.get_json()
    with app.app_context():
        user = User.query.filter_by(username="pad815_invited").one()
        _assert_reference(Coach.query.filter_by(user_id=user.id).one().id)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-2")
def test_a_coach_created_before_the_rule_reads_as_before(app):
    """Control: a coach with no row gets rule 1's engine-off default on first read, not the reference."""
    from padel_app.models import Coach, User
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        user = User(name="Old Coach", username="pad815_old", password="pw123")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.commit()
        config = get_or_create_config(coach.id)
        assert config.auto_notify_enabled is False
        assert config.invitation_mode == "automatic"
        assert config.auto_accept_join_requests is False
        assert config.invitation_groups is None and config.tiebreakers is None
        assert config.quiet_hours_enabled is False


def test_a_signup_failing_after_the_config_leaves_nothing(client, app, monkeypatch):
    """The config row joins the account's unit of work (auth.register rule 12, PAD-476): a failure
    right after it is written leaves no user, coach, level or config."""
    from padel_app.models import Coach, CoachLevel, User
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import coach_service

    real = coach_service.create_default_config_for_coach

    def real_then_fail(coach):
        real(coach)
        raise RuntimeError("failure after the default config")

    monkeypatch.setattr(coach_service, "create_default_config_for_coach", real_then_fail)
    body = {
        "role": "coach", "name": "Rui Costa", "username": "pad815_fail", "email": "pad815_fail@example.com",
        "password": "Segura123", "birthDate": "2000-01-01", "country": "PT",
    }
    assert client.post("/api/auth/register", json=body).status_code == 500
    with app.app_context():
        counts = tuple(m.query.count() for m in (User, Coach, CoachLevel, NotificationConfig))
    assert counts == (0, 0, 0, 0)
