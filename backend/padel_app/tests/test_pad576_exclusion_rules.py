"""PAD-576 — the engine never invites a player it must not: the ticket's five exclusion rules,
each pinned in the automatic wave (round 1 of the groups), the semi-automatic queue
(``compute_full_invite_queue``, what the coach approves) and the waiting-list wave (group 0).
Every test names the stage the pipeline answers (``CANDIDATE_STAGES``), so a regression reads
as "invited" where a rule should have stopped it.

Rules (ticket table): 1 already answered this class; 2 another class the same club day
(``noSameDayClass`` restriction, PAD-523); 3 an availability blocker over the class; 4 already
invited to this class; 5 invitations switched off in the student's preferences.

Seed: `test_pad523_no_same_day_class._seed` — coach, students `busy` and `free`, a target class
with one open vacancy (round 1), an optional other class of another coach.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad523_no_same_day_class import H, TARGET, _seed, _verdicts


def _instance(ids):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, ids["instance"])


def _vacancy(ids):
    from padel_app.models.vacancy import Vacancy

    return db.session.get(Vacancy, ids["vacancy"])


def _user_id(player_id):
    from padel_app.models.players import Player

    return db.session.get(Player, player_id).user_id


def _semi_auto_queue_ids(ids):
    """The list a semi-automatic coach approves (semi-auto-approval rule 4): the same pipeline."""
    from padel_app.services.notification_service import get_or_create_config
    from padel_app.services.replacement_approval_service import compute_full_invite_queue

    queue = compute_full_invite_queue(_vacancy(ids), _instance(ids), ids["coach"], get_or_create_config(ids["coach"]))
    return {int(e["id"]) for e in queue}


def _waiting_list_stage(ids, player_id):
    """Group 0 (invitations rule 8a): the waiting-list wave for one player."""
    return _verdicts(ids, wave=("waiting_list", 0))[player_id]


def _invitation(ids, player_id, *, status="sent", answer=None, round_number=1, vacancy_id=None, withdrawn=False, answered_by=None):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.utils.dates import utcnow_naive

    e = NotificationEvent(
        coach_id=ids["coach"], lesson_instance_id=ids["instance"], player_id=player_id, type="auto",
        round_number=round_number, status=status, answer=answer, answered_by=answered_by,
        vacancy_id=ids["vacancy"] if vacancy_id is None else vacancy_id,
        withdrawn_by_coach_at=utcnow_naive() if withdrawn else None,
    )
    db.session.add(e)
    db.session.commit()
    return e


def _assert_excluded(ids, player_id, stage):
    assert _verdicts(ids)[player_id] == stage, "automatic wave"
    assert player_id not in _semi_auto_queue_ids(ids), "the semi-automatic queue is the same pipeline"
    assert ids["free"] in _semi_auto_queue_ids(ids), "the sibling who breaks no rule is still offered"


# ── Rule 1: already answered this class ──────────────────────────────────────────────────────

def test_rule1_a_student_who_said_no_to_this_class_is_not_asked_again(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r1no")
        _invitation(ids, ids["busy"], status="expired", answer="no", answered_by="student")
        _assert_excluded(ids, ids["busy"], "declined_this_class")


def test_rule1_a_no_the_coach_recorded_counts_the_same(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r1coach")
        _invitation(ids, ids["busy"], status="expired", answer="no", answered_by="coach")
        _assert_excluded(ids, ids["busy"], "declined_this_class")


def test_rule1_a_student_who_is_going_is_not_invited_to_their_own_class(app):
    from padel_app.models.presences import Presence

    with app.app_context():
        ids = _seed(restriction_on=False, tag="r1yes")
        db.session.add(Presence(player_id=ids["busy"], lesson_instance_id=ids["instance"], invited=True,
                                enrolment_source="roster", status=None, response="confirmed"))
        db.session.commit()
        _assert_excluded(ids, ids["busy"], "already_enrolled")


def test_rule1_a_no_to_this_class_also_keeps_them_out_of_the_waiting_list_wave(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r1wl")
        _invitation(ids, ids["busy"], status="expired", answer="no", answered_by="student")
        assert _waiting_list_stage(ids, ids["busy"]) == "declined_this_class"


# ── Rule 2: another class the same club day ───────────────────────────────────────────────────

def test_rule2_another_class_that_day_excludes_when_the_restriction_is_on(app):
    with app.app_context():
        ids = _seed(restriction_on=True, other_start=TARGET + 3 * H, tag="r2on")
        _assert_excluded(ids, ids["busy"], "has_class_same_day")
        assert _waiting_list_stage(ids, ids["busy"]) == "has_class_same_day"


def test_rule2_the_restriction_is_opt_in_off_by_default_the_student_is_invited(app):
    """Finding for the owner: rule 2 holds only when Settings › Restrictions › "no same-day class"
    is on (PAD-523, config rule 6e). Off — the default — the engine invites them."""
    with app.app_context():
        ids = _seed(restriction_on=False, other_start=TARGET + 3 * H, tag="r2off")
        assert _verdicts(ids)[ids["busy"]] == "invited"
        assert ids["busy"] in _semi_auto_queue_ids(ids)


# ── Rule 3: an availability blocker over the class ───────────────────────────────────────────

def _block(ids, player_id, start, end, *, blocks=True, weekly=False):
    from padel_app.models.calendar_blocks import CalendarBlock

    b = CalendarBlock(user_id=_user_id(player_id), type="unavailable", start_datetime=start, end_datetime=end,
                      is_recurring=weekly, recurrence_rule='{"frequency": "weekly"}' if weekly else None,
                      blocks_auto_invitations=blocks, title="busy")
    db.session.add(b)
    db.session.commit()
    return b


def test_rule3_a_blocker_over_the_whole_class_excludes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r3full")
        _block(ids, ids["busy"], TARGET - H, TARGET + 2 * H)
        _assert_excluded(ids, ids["busy"], "unavailable")
        assert _waiting_list_stage(ids, ids["busy"]) == "unavailable"


def test_rule3_a_partial_overlap_excludes_too(app):
    """A blocker that ends 30 minutes into the class still overlaps it."""
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r3part")
        _block(ids, ids["busy"], TARGET - 2 * H, TARGET + timedelta(minutes=30))
        _assert_excluded(ids, ids["busy"], "unavailable")


def test_rule3_a_weekly_blocker_on_the_class_weekday_excludes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r3week")
        _block(ids, ids["busy"], TARGET - timedelta(days=7), TARGET - timedelta(days=7) + H, weekly=True)
        _assert_excluded(ids, ids["busy"], "unavailable")


def test_rule3_a_blocker_that_does_not_block_invitations_does_not_exclude(app):
    """Finding for the owner: only a blocker marked "blocks automatic invitations" counts; a plain
    calendar block (e.g. a break) leaves the student invitable."""
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r3plain")
        _block(ids, ids["busy"], TARGET - H, TARGET + 2 * H, blocks=False)
        assert _verdicts(ids)[ids["busy"]] == "invited"


# ── Rule 4: already invited to this class ────────────────────────────────────────────────────

def test_rule4_a_live_invitation_for_this_spot_is_not_sent_twice(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r4live")
        _invitation(ids, ids["busy"], status="sent")
        _assert_excluded(ids, ids["busy"], "already_invited")


def test_rule4_a_live_invitation_for_a_sibling_spot_of_the_same_class_holds_them(app):
    """Two spots open at once (PAD-574's case): one live offer per student per class."""
    from padel_app.models.vacancy import Vacancy

    with app.app_context():
        ids = _seed(restriction_on=False, tag="r4sib")
        sibling = Vacancy(lesson_instance_id=ids["instance"], coach_id=ids["coach"], status="open",
                          current_round_number=1, current_batch_number=0)
        db.session.add(sibling)
        db.session.commit()
        _invitation(ids, ids["busy"], status="sent", vacancy_id=sibling.id)
        _assert_excluded(ids, ids["busy"], "offered_another_spot")


def test_rule4_an_invitation_the_coach_withdrew_counts_as_a_no(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r4wd")
        _invitation(ids, ids["busy"], status="expired", withdrawn=True)
        _assert_excluded(ids, ids["busy"], "declined_this_class")


def test_rule4_an_accepted_invitation_means_enrolled(app):
    from padel_app.models.presences import Presence

    with app.app_context():
        ids = _seed(restriction_on=False, tag="r4yes")
        _invitation(ids, ids["busy"], status="confirmed", answer="yes")
        db.session.add(Presence(player_id=ids["busy"], lesson_instance_id=ids["instance"], invited=True,
                                enrolment_source="fill", status=None, response="confirmed"))
        db.session.commit()
        _assert_excluded(ids, ids["busy"], "already_enrolled")


@pytest.mark.xfail(strict=True, reason=(
    "PAD-576 finding (rule 4, 'expirado'): an invitation that EXPIRED unanswered in round 1 does not "
    "exclude the student from round 2 of the same spot — the pipeline keys exclusion on a no, a "
    "withdrawal or a live offer (invitations rules 8, 18), and rule 8 reads as if asking again after "
    "an expiry is by design. The ticket lists 'expirado' among the exclusions: owner decision "
    "(PAD-576 gap ticket). Flip this to a plain test when it is decided."
))
def test_rule4_an_expired_invitation_from_an_earlier_round_excludes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r4exp")
        from padel_app.models.notification_config import NotificationConfig

        _invitation(ids, ids["busy"], status="expired", round_number=1)
        # A real second round: the seed's config holds one group, so give it two (a wave that does
        # not exist answers `no_round_matched` for everyone, which would hide the question).
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach"]).first()
        cfg.invitation_groups = [{"id": "1", "rules": []}, {"id": "2", "rules": []}]
        _vacancy(ids).current_round_number = 2
        db.session.commit()
        verdicts = _verdicts(ids, wave=("group", 2))
        assert verdicts[ids["free"]] == "invited", "round 2 exists for the sibling"
        assert verdicts[ids["busy"]] != "invited"


# ── Rule 5: invitations switched off in the student's preferences ────────────────────────────

def _set_prefs(player_id, **flags):
    from padel_app.models.users import User

    u = db.session.get(User, _user_id(player_id))
    for k, v in flags.items():
        setattr(u, k, v)
    db.session.commit()


def test_rule5_automatic_invitations_off_excludes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r5auto")
        _set_prefs(ids["busy"], notif_block_auto_invitations=True)
        _assert_excluded(ids, ids["busy"], "auto_invites_off")
        assert _waiting_list_stage(ids, ids["busy"]) == "auto_invites_off"


def test_rule5_everything_off_excludes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r5all")
        _set_prefs(ids["busy"], notif_block_all=True)
        _assert_excluded(ids, ids["busy"], "auto_invites_off")


def test_rule5_manual_invitations_off_alone_does_not_stop_the_engine(app):
    """Finding for the owner: "manual invitations off" is a different switch (PAD-112) — the engine
    still invites; only the coach's hand-made invitation is refused."""
    with app.app_context():
        ids = _seed(restriction_on=False, tag="r5man")
        _set_prefs(ids["busy"], notif_block_manual_invitations=True)
        assert _verdicts(ids)[ids["busy"]] == "invited"
