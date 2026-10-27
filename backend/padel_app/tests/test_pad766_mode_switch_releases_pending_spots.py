"""
PAD-766 (B-688): a coach who leaves semi-automatic for automatic kept every spot opened under
semi-automatic "awaiting approval" for good. The vacancy's approval_status was set from the mode at
creation and never looked at again: the mode change touched no vacancy, and the sweep skips a
pending spot whatever the coach's mode is now. On prod a spot freed on 21 Oct was still open, with
no invitation ever sent, six days later (the class in the owner's screenshots, 27 Oct).

semi-auto-approval rule 1a: the switch releases the coach's pending spots (not_required, their
prompt stale) and the sweep starts them; the sweep also releases a pending spot whose coach is now
automatic, so the rows stranded before the fix recover with no data repair. A dismissed spot stays
dismissed.

Pinned clock (`NOW`, the class tomorrow 09:00, the invitation window open), no scheduler: the
approval prompt is written inline, as in the rest of the suite.
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events, _seed


def _semi_spot_with_prompt(monkeypatch):
    """A semi-automatic coach's class: one student marked absent, the engine asked, so one open
    vacancy pending approval with its one pending prompt and nobody invited."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, coach_id, _students, _others = _seed(enrolled=1, candidates=3, max_players=1, semi=True)
    presence = Presence.query.filter_by(lesson_instance_id=instance_id).one()
    presence.status = "absent"
    presence.confirmed = True
    db.session.commit()
    trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
    assert _state(instance_id) == [("open", "pending", "pending")]
    assert _live_events(instance_id) == []
    return instance_id, coach_id


def _state(instance_id):
    """Each vacancy of the class: (status, approval_status, its prompt's status or None)."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy

    rows = []
    for v in Vacancy.query.filter_by(lesson_instance_id=instance_id).order_by(Vacancy.id).all():
        db.session.refresh(v)
        prompt = ReplacementApprovalPrompt.query.filter_by(vacancy_id=v.id).first()
        if prompt is not None:
            db.session.refresh(prompt)
        rows.append((v.status, v.approval_status, prompt.status if prompt else None))
    return rows


def _set_mode_behind_the_engine(coach_id, mode):
    """The mode as a switch made before this rule left it: changed, and nothing else."""
    from padel_app.models.notification_config import NotificationConfig

    NotificationConfig.query.filter_by(coach_id=coach_id).one().invitation_mode = mode
    db.session.commit()


def test_switching_to_automatic_releases_the_pending_spot_and_stales_its_prompt(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches, update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)

        update_config(coach_id, {"invitationMode": "automatic"})
        assert _state(instance_id) == [("open", "not_required", "stale")], \
            "the switch releases the spot in its own commit"

        process_invitation_batches(now=NOW)
        assert len(_live_events(instance_id)) == 3, "the sweep starts the released spot (maxSimultaneous 3)"


def test_the_sweep_starts_a_pending_spot_stranded_by_an_earlier_switch(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)
        _set_mode_behind_the_engine(coach_id, "automatic")

        process_invitation_batches(now=NOW)
        assert _state(instance_id) == [("open", "not_required", "stale")]
        assert len(_live_events(instance_id)) == 3, "the stranded spot is invited on the first tick"


def test_a_dismissed_spot_stays_dismissed_on_the_switch_and_in_the_sweep(app, monkeypatch):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches, update_config
    from padel_app.services.replacement_approval_service import respond_to_approval

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id).one()
        bundle_id = ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).one().bundle_id
        respond_to_approval(bundle_id, "dismiss", coach_id, now=NOW)
        assert _state(instance_id) == [("open", "dismissed", "dismissed")]

        update_config(coach_id, {"invitationMode": "automatic"})
        process_invitation_batches(now=NOW)
        assert _state(instance_id) == [("open", "dismissed", "dismissed")], "the coach already said no"
        assert _live_events(instance_id) == []


def test_a_semi_automatic_coach_keeps_the_spot_pending(app, monkeypatch):
    """Only the mode counts: a coach still in semi-automatic — whatever else they save — keeps the
    spot waiting for their answer, and the sweep sends nothing."""
    from padel_app.services.notification_service import process_invitation_batches, update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)

        update_config(coach_id, {"invitationMode": "semi_automatic", "openSpotsVisible": True})
        process_invitation_batches(now=NOW)
        assert _state(instance_id) == [("open", "pending", "pending")]
        assert _live_events(instance_id) == []
