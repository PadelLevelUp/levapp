"""
PAD-775 (B-695): a student holding an unanswered invitation for a class at 12:00 was invited, 45
minutes later, to another class the same day at 13:30. Rule 6e ("do not invite a student who
already has a class that day") reads presences only, and rule 18's live-offer skip covers other
spots of the same class only, so nothing in the engine looked at a live invitation for another
class that day.

invitations rule 18c: while rule 6e is on, every automatic path skips a student with a live
invitation for another class the same club day, any coach (`pending_invite_same_day`); another day
never blocks; the student is eligible again once that invitation ends; a yes withdraws the student's
other live invitations that day (`booked_same_day`, "Já inscrito noutra aula"), which is not a "no";
the coach's manual invitations are not blocked.

Pinned clock (`NOW`); class A is tomorrow 09:00 (the shared seed, coach A), class B is coach B's,
the same day at 12:00 or the day after.
"""
from datetime import timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, START, _seed


def _class_b(player_id, *, days=0, same_day_rule=True):
    """Coach B's class (`days` after class A, at 12:00) with a live manual invitation to
    `player_id`. Returns that invitation."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.users import User
    from padel_app.services.notification_service import send_manual_notifications

    user = User(name="Coach B", username="p775coachb", email="p775coachb@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    club = Club(name="P775 Club B", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player_id))
    start = START.replace(hour=12) + timedelta(days=days)
    lesson = Lesson(title="P775 B", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                    club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=4, status="scheduled", notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True,
                                      restrictions={"noSameDayClass": {"enabled": same_day_rule}}))
    db.session.commit()
    (event,) = send_manual_notifications(instance.id, [player_id], coach.id)
    return event


def _class_a(monkeypatch, *, same_day_rule=True):
    """Coach A's class tomorrow 09:00 with one spot freed and six candidates, nobody asked yet."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, coach_id, _students, others = _seed(enrolled=1, candidates=6, max_players=1, max_sim=6)
    presence = Presence.query.filter_by(lesson_instance_id=instance_id).one()
    presence.status = "absent"
    presence.confirmed = True
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.restrictions = {**config.get_restrictions(), "noSameDayClass": {"enabled": same_day_rule}}
    db.session.commit()
    return instance_id, coach_id, others


def _start(instance_id, coach_id):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations

    trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)


def _stage(instance_id, coach_id, player_id):
    """The stage `player_id` gets in class A's first wave now."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import evaluate_candidates

    instance = LessonInstance.query.get(instance_id)
    vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id).first()
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    verdicts = evaluate_candidates(vacancy, instance, coach_id, config, wave=("group", 1),
                                   only_player_ids=[player_id])
    return verdicts[0].stage


def _invited(instance_id):
    from padel_app.models.notification_event import NotificationEvent

    return {e.player_id for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id).all()}


def test_an_automatic_round_skips_a_student_with_a_live_invitation_that_day_from_another_coach(app, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        _class_b(others[0])

        _start(instance_id, coach_id)
        assert others[0] not in _invited(instance_id)
        assert set(others[1:]) <= _invited(instance_id)
        assert _stage(instance_id, coach_id, others[0]) == "pending_invite_same_day"


def test_a_live_invitation_for_another_day_does_not_block(app, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        _class_b(others[0], days=1)

        _start(instance_id, coach_id)
        assert others[0] in _invited(instance_id)


def test_the_student_is_eligible_again_once_that_invitation_ends(app, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        other = _class_b(others[0])
        _start(instance_id, coach_id)
        assert _stage(instance_id, coach_id, others[0]) == "pending_invite_same_day"

        other.status = "expired"
        db.session.commit()
        assert _stage(instance_id, coach_id, others[0]) not in ("pending_invite_same_day",)


def test_a_yes_withdraws_the_same_day_invitations_and_that_is_not_a_no(app, monkeypatch):
    from padel_app.models import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        _start(instance_id, coach_id)  # others[0] is invited to class A first
        mine = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=others[0]).one()
        other = _class_b(others[0])  # then coach B invites them by hand (not blocked)

        respond_to_notification(mine.id, "yes", Player.query.get(others[0]).user_id, now=NOW)

        db.session.refresh(other)
        assert (other.status, other.retired_reason, other.answer) == ("expired", "booked_same_day", None)
        assert Message.query.get(other.message_id).msg_metadata["response"] == "booked_same_day"


def test_with_rule_6e_off_a_live_invitation_that_day_does_not_block(app, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch, same_day_rule=False)
        _class_b(others[0])

        _start(instance_id, coach_id)
        assert others[0] in _invited(instance_id)


def test_with_rule_6e_off_for_the_other_class_a_yes_leaves_its_invitation_live(app, monkeypatch):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        _start(instance_id, coach_id)
        mine = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=others[0]).one()
        other = _class_b(others[0], same_day_rule=False)

        respond_to_notification(mine.id, "yes", Player.query.get(others[0]).user_id, now=NOW)

        db.session.refresh(other)
        assert (other.status, other.retired_reason) == ("sent", None)


def test_a_manual_invitation_is_not_blocked(app, monkeypatch):
    from padel_app.services.notification_service import send_manual_notifications

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _class_a(monkeypatch)
        _class_b(others[0])

        assert len(send_manual_notifications(instance_id, [others[0]], coach_id)) == 1
