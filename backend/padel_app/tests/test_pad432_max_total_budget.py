"""PAD-432 — `maxTotal` is one budget per class occurrence, shared by its open
spots (notifications.config rule 6c, plus its two acceptance criteria).

Before this ticket the budget existed but the criteria were unpinned:
`_check_restrictions` and `_send_invitation_batch` both count
`NotificationEvent` rows by `lesson_instance_id` with status in
``["sent", "confirmed"]`` — across ALL vacancies (open spots) for that
occurrence, not per spot — and `queued`/`expired` rows never count. These
tests pin that behaviour directly against the two engine chokepoints named in
the spec.
"""
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


def _seed(suffix, n_players, n_vacancies=2):
    """A coach with a level, ``n_players`` roster students (all eligible — the
    single invitation group has no rules), a class 48h out, ``n_vacancies``
    OPEN vacancies on it (open spots sharing one budget), and a maxTotal=3
    config. Returns (coach, instance, players, vacancies, config)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy

    coach_user = _create_user("Coach", f"pad432coach{suffix}")
    coach = _create_coach(coach_user)
    level = _create_level(coach, label="Beg", code="B1")
    instance = _create_instance(coach, level, start_offset_hours=48, max_players=n_vacancies)

    players = []
    for i in range(n_players):
        u = _create_user(f"Player{i}", f"pad432p{suffix}{i}")
        p = _create_player(u)
        _create_coach_player(coach, p, level=level)
        players.append(p)

    vacancies = []
    for _ in range(n_vacancies):
        v = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                    current_round_number=1, current_batch_number=0)
        db.session.add(v)
        db.session.flush()
        vacancies.append(v)

    cfg = NotificationConfig(
        coach_id=coach.id,
        auto_notify_enabled=True,
        invitation_groups=[{"id": "1", "rules": []}],  # empty rules: admits the whole roster
        restrictions={
            "maxSimultaneous": {"enabled": False, "value": 10},  # never the binding constraint here
            "maxTotal": {"enabled": True, "value": 3},
        },
    )
    db.session.add(cfg)
    db.session.commit()
    return coach, instance, players, vacancies, cfg


def _make_event(coach, instance, vacancy, player, status):
    from padel_app.models.notification_event import NotificationEvent
    e = NotificationEvent(
        coach_id=coach.id, lesson_instance_id=instance.id, player_id=player.id,
        vacancy_id=vacancy.id, type="auto", round_number=1, status=status,
    )
    e.create()
    return e


def _counted(instance_id):
    """NotificationEvent rows charged against the budget: sent + confirmed."""
    from padel_app.models.notification_event import NotificationEvent
    return NotificationEvent.query.filter_by(lesson_instance_id=instance_id).filter(
        NotificationEvent.status.in_(["sent", "confirmed"])
    ).count()


def test_maxtotal_budget_is_shared_across_the_occurrences_open_spots(app):
    """Criterion 1: two open spots on one occurrence share one maxTotal
    budget. 3 sent/confirmed events spread across BOTH vacancies at
    maxTotal=3 must refuse a new invitation for the occurrence."""
    from padel_app.services.notification_service import _check_restrictions

    with app.app_context():
        coach, instance, players, vacancies, cfg = _seed("a", n_players=3, n_vacancies=2)
        v1, v2 = vacancies
        p1, p2, p3 = players

        _make_event(coach, instance, v1, p1, "sent")
        _make_event(coach, instance, v1, p2, "confirmed")
        _make_event(coach, instance, v2, p3, "sent")  # the OTHER open spot

        # Prove the setup: 3 events charged against the budget, genuinely
        # spread across both open spots (two distinct vacancy ids).
        assert _counted(instance.id) == 3
        from padel_app.models.notification_event import NotificationEvent
        charged_vacancy_ids = {
            e.vacancy_id
            for e in NotificationEvent.query.filter_by(lesson_instance_id=instance.id).all()
        }
        assert charged_vacancy_ids == {v1.id, v2.id}

        assert _check_restrictions(instance, coach.id, cfg.get_restrictions()) is False


def test_send_invitation_batch_trims_to_the_remaining_shared_budget(app):
    """Criterion 1 (trimming): 2 already sent (on one spot), maxTotal 3, 5
    eligible candidates for the OTHER spot -> at most 1 goes out."""
    from padel_app.services.notification_service import _send_invitation_batch

    with app.app_context():
        coach, instance, players, vacancies, cfg = _seed("b", n_players=7, n_vacancies=2)
        v1, v2 = vacancies
        already = players[:2]
        candidates = players[2:]
        assert len(candidates) == 5

        _make_event(coach, instance, v1, already[0], "sent")
        _make_event(coach, instance, v1, already[1], "sent")

        # Prove the setup: 2 charged already, none of the 5 candidates have
        # been touched yet.
        assert _counted(instance.id) == 2
        from padel_app.models.notification_event import NotificationEvent
        assert NotificationEvent.query.filter(
            NotificationEvent.player_id.in_([c.id for c in candidates])
        ).count() == 0

        with patch(PATCHES[0]), patch(PATCHES[1]):
            notified = _send_invitation_batch(v2, instance, cfg, coach.id)

        assert len(notified) == 1, notified
        assert _counted(instance.id) == 3


def test_expired_invitation_gives_its_place_back_to_the_budget(app):
    """Criterion 2: at budget 3, expiring one invitation (plus an unrelated
    `queued` one, which never counted) frees exactly one more slot."""
    from padel_app.services.notification_service import _check_restrictions

    with app.app_context():
        coach, instance, players, vacancies, cfg = _seed("c", n_players=4, n_vacancies=2)
        v1, v2 = vacancies
        p1, p2, p3, p4 = players

        e1 = _make_event(coach, instance, v1, p1, "sent")
        _make_event(coach, instance, v1, p2, "confirmed")
        _make_event(coach, instance, v2, p3, "sent")

        # Prove the setup: budget is exhausted at 3, gate refuses.
        assert _counted(instance.id) == 3
        assert _check_restrictions(instance, coach.id, cfg.get_restrictions()) is False

        e1.status = "expired"
        e1.save()
        _make_event(coach, instance, v2, p4, "queued")  # decoy: must not count either

        # Prove the setup again: expired + queued together leave only 2 charged.
        assert _counted(instance.id) == 2

        assert _check_restrictions(instance, coach.id, cfg.get_restrictions()) is True
