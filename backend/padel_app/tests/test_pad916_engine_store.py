"""PAD-916: the new engine's table-backed store (services/engine_store.py, swap plan §5).

The 133 scenarios run through it with ``INVITATION_ENGINE=new INVITATION_STORE=db``; these pin what
the scenarios cannot see: an effect applied twice is written once, the outbox sends each message
once, one invitation per student per session (D1), never two sessions at one hour whatever path
places the student (engine-answers rule 10), and what the waiting-list table cannot hold.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import Approval, PendingRequest, SpotType, Student
from padel_app.sql_db import db

@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


NOW = datetime(2026, 11, 1, 18, 0)
START = datetime(2026, 11, 1, 20, 0)          # Lisbon wall-clock; winter, so UTC too


def _seed(app, starts=(START,), players=3, side="left", capacity=4):
    """One coach with a level-3 rung, ``players`` students, one occurrence per start; the first
    student is the regular of every occurrence, on the left; the others play ``side``. Returns (store, session ids, player ids)."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services.engine_store import TableStore

    cu = User(name="Coach", username="c916", password="x", status="active")
    db.session.add(cu)
    db.session.flush()
    coach = Coach(user_id=cu.id)
    club = Club(name="Club", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="N3", code="N3", display_order=3)
    db.session.add(level)
    db.session.flush()
    pids = []
    for n in range(players):
        u = User(name=f"S{n}", username=f"s916_{n}", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id,
                                                side="left" if not pids else side))
        pids.append(str(p.id))
    sessions = []
    for start in starts:
        lesson = Lesson(title="C", start_datetime=start, end_datetime=start + timedelta(hours=1), is_recurring=False,
                        type="academy", max_players=capacity, color="#000", status="active", club_id=club.id,
                        default_level_id=level.id)
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=capacity, status="scheduled", level_id=level.id)
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
        db.session.add(Association_PlayerLesson(player_id=int(pids[0]), lesson_id=lesson.id))
        sessions.append(str(inst.id))
    db.session.commit()
    store = TableStore(clock=lambda: NOW)
    for sid in sessions:
        with store.unit((sid,)):
            store.add_session(sid, 3, capacity, START, [(Student(pids[0], 3, frozenset({"L"})), "L")], NOW)
    return store, sessions, pids


def _invited(session, student, at=NOW):
    return fx.Invited(session, at, student, frozenset({SpotType("L", 3)}), "L", 0, at + timedelta(minutes=20))


def test_snapshot_reads_what_apply_wrote(app):
    store, (a,), (reg, x, y) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x), _invited(a, y), fx.Answered(a, NOW, x, "yes", "invitation"),
                     fx.Placed(a, NOW, x, "L", "invitation"), fx.Answered(a, NOW, y, "no", "invitation")])
    s = store.snapshot(a)
    assert {p.student: (p.side, p.how) for p in s.going} == {reg: ("L", "regular"), x: ("L", "invitation")}
    assert [i.student for i in s.invitations] == [x, y]
    assert s.said_no == {y} and not s.open_invitations
    assert {st.id for st in s.pool} == {y}                                 # x is in the session now
    with store.unit((a,)):
        store.apply([fx.Absence(a, NOW, reg, "on_time"), fx.Left(a, NOW, reg, "regular_no")])
    s = store.snapshot(a)
    assert s.absent == {reg} and reg not in {p.student for p in s.going} and reg in {r.id for r in s.regulars}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-1")
def test_an_effect_applied_twice_is_written_once(app):
    from padel_app.models import EngineEffect, EngineInvitation

    store, (a,), (_, x, _) = _seed(app)
    batch = [_invited(a, x), fx.AttendanceRequested(a, NOW, x)]
    with store.unit((a,)):
        store.apply(batch)
    with store.unit((a,)):
        store.apply(batch)                                              # a retried apply
    assert EngineInvitation.query.count() == 1
    assert EngineEffect.query.count() == 2


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-2")
def test_the_outbox_sends_each_message_once(app):
    from padel_app.services.engine_store import dispatch

    store, (a,), (_, x, y) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x), _invited(a, y), fx.Message(a, NOW, x, "sorry"),
                     fx.Answered(a, NOW, y, "no", "invitation")])           # not a message
    sent = []
    assert dispatch(lambda row: sent.append((row.kind, row.player_id)), now=NOW) == 3
    assert dispatch(lambda row: sent.append((row.kind, row.player_id)), now=NOW) == 0
    assert sorted(sent) == sorted([("Invited", int(x)), ("Invited", int(y)), ("Message", int(x))])


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-32")
def test_a_second_invitation_for_one_student_is_refused(app):
    from padel_app.services.engine_store import StoreConflict

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x)])
    with pytest.raises(StoreConflict), store.unit((a,)):
        store.apply([_invited(a, x, NOW + timedelta(minutes=5))])


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-22")
def test_a_placement_at_an_hour_the_student_is_going_elsewhere_rolls_back(app):
    from padel_app.models.presences import Presence
    from padel_app.services.engine_store import SameHourConflict

    store, (a, b), (_, x, _) = _seed(app, starts=(START, START))
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, x, "L", "invitation")])
    with pytest.raises(SameHourConflict), store.unit((b,)):
        store.apply([fx.Placed(b, NOW, x, "L", "auto_from_waiting_list")])
    assert Presence.query.filter_by(lesson_instance_id=int(b), player_id=int(x)).first() is None
    assert x in store.snapshot(b).busy_same_time


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-21")
def test_both_waiting_lists_at_once_is_a_named_conflict(app):
    from padel_app.services.engine_store import StoreConflict

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([fx.WaitingListJoined(a, NOW, x, "coach", "L")])
    with pytest.raises(StoreConflict), store.unit((a,)):
        store.apply([fx.WaitingListJoined(a, NOW, x, "students", None, "own")])
    s = store.snapshot(a)
    assert [(w.student, w.list, w.side) for w in s.waiting_list] == [(x, "coach", "L")]




@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-20")
def test_a_no_is_the_students_answer_and_its_lateness_is_the_notice(app):
    """Owner ruling D4: the engine judges the notice by ``absence_cutoff_before``, which the coach's
    ``cancellationDeadlineHours`` sets (notifications.config rule 19, CONFIG-56). The store writes an
    on-time No as ``declined`` (``proactive_decline`` before the student was asked) and a late one as
    ``cancelled``, at the No's instant, so the app's derived lateness is that notice; it never writes
    ``justification``. A no-show and an automatic entrant's No record no response."""
    from padel_app.invitation_engine import absences
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence
    from padel_app.services.presence_response import presence_late_cancellation

    store, (a,), (reg, x, auto, gone, unasked) = _seed(app, players=5)
    config = NotificationConfig(coach_id=store.coach_of(a), cancellation_deadline_hours=24)
    db.session.add(config)
    db.session.commit()
    settings = EngineSettings(absence_cutoff_before=timedelta(hours=24))   # the mapping's value (PAD-917)
    asked_at = START - timedelta(hours=48)
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, s, "L", how) for s, how in (
            (x, "invitation"), (auto, "auto_from_waiting_list"), (gone, "invitation"), (unasked, "invitation"))]
            + [fx.AttendanceRequested(a, asked_at, s) for s in (reg, x)])
    snapshot = store.snapshot(a)
    leaving = ((reg, START - timedelta(hours=30), "regular_no"), (x, START - timedelta(hours=10), "cancel"),
               (auto, START - timedelta(hours=10), "cancel"), (gone, START + timedelta(hours=1), "no_show"),
               (unasked, START - timedelta(hours=30), "cancel"))
    notices = {}
    for student, at, reason in leaving:
        notices[student] = absences.notice(snapshot, settings, student, reason, at)
        with store.unit((a,)):
            store.apply([fx.Absence(a, at, student, notices[student]), fx.Left(a, at, student, reason)])
    assert [notices[s] for s in (reg, x, auto, gone, unasked)] == ["on_time", "late", "none", "late", "on_time"]
    rows = {str(p.player_id): p for p in Presence.query.filter_by(lesson_instance_id=int(a)).all()}
    assert {s: rows[s].response for s in (reg, x, auto, gone, unasked)} == {
        reg: "declined", x: "cancelled", auto: "none", gone: "none", unasked: "proactive_decline"}
    for s, at, _ in leaving:
        assert rows[s].status == "absent"
        if rows[s].response != "none":
            assert rows[s].responded_at == at
            assert presence_late_cancellation(rows[s], config=config) == (notices[s] == "late")
    assert {p.justification for p in rows.values()} == {None}


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-28")
def test_a_new_engine_enrolment_writes_only_the_presence(app, monkeypatch):
    """classes.instance-enrollment rule 14: ``enrol(..., new_engine=True)`` writes the presence (a
    returning student's absence cleared) and nothing else: no vacancy closed or reconciled, no
    reminder pass armed, no ``added_to_class`` message, even from the coach's own hand. The same
    calls without ``new_engine`` do all three, so the spies can see them."""
    from padel_app import scheduler
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services import lesson_service as ls
    from padel_app.services import notification_service as ns

    calls = []
    monkeypatch.setattr(scheduler, "arm_ask_for_student", lambda *a, **k: calls.append("armed"))
    monkeypatch.setattr(ns, "reconcile_vacancies", lambda *a, **k: calls.append("reconciled"))
    monkeypatch.setattr(ns, "_open_vacancy_for", lambda *a, **k: calls.append("own vacancy") or None)
    monkeypatch.setattr(ns, "notify_student_added_to_class", lambda *a, **k: calls.append("added_to_class"))

    store, (a,), (reg, x, y) = _seed(app)
    inst = db.session.get(LessonInstance, int(a))
    regular = Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(reg)).one()
    regular.status, regular.justification = "absent", "justified"
    db.session.commit()

    ls.enrol(int(x), inst, "coach", new_engine=True)
    ls.enrol(int(reg), inst, "coach", new_engine=True)                    # a return (rule 10)
    db.session.commit()
    assert calls == []
    rows = {str(p.player_id): p for p in Presence.query.filter_by(lesson_instance_id=int(a)).all()}
    assert (rows[reg].status, rows[reg].justification, rows[reg].response) == (None, None, "none")
    assert x in rows

    ls.enrol(int(y), inst, "coach")                                       # the old engine's enrolment
    db.session.commit()
    assert {"armed", "reconciled", "added_to_class"} <= set(calls)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-53")
def test_app_gates_build_the_pool(app):
    """A student below the class's eligibility bar, one in ``excludedPlayers`` and one with another
    class that day under ``noSameDayClass`` are not in ``pool``; one already holding the coach's
    ``maxInvitesPerStudentPerDay`` invitations today is in ``postponed`` (notifications.config rule 19;
    the engine's own bar, wide open, is CONFIG-60, PAD-917)."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig

    store, (a, b), (_, capped, excluded, same_day, ineligible, free) = _seed(
        app, starts=(START, START + timedelta(hours=2)), players=6)
    coach_id = store.coach_of(a)
    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(ineligible)).one().level_id = None
    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True,
                                eligibility_rules=[{"attribute": "level", "operation": "within_n_above_class",
                                                    "value": 0}])
    config.restrictions = {"excludedPlayers": {"enabled": True, "playerIds": [excluded]},
                           "noSameDayClass": {"enabled": True},
                           "maxInvitesPerStudentPerDay": {"enabled": True, "value": 1}}
    db.session.add(config)
    db.session.commit()
    with store.unit((b,)):
        store.apply([fx.Placed(b, NOW, same_day, "L", "invitation"), _invited(b, capped)])

    s = store.snapshot(a)
    assert {st.id for st in s.pool} == {capped, free}
    assert s.postponed == {capped}

    config.restrictions = {"noSameDayClass": {"enabled": False}}       # every gate off
    config.eligibility_rules = None
    db.session.commit()
    s = store.snapshot(a)
    assert {st.id for st in s.pool} == {capped, excluded, same_day, ineligible, free}
    assert s.postponed == frozenset()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-3")
def test_levels_reach_the_engine_as_ladder_positions(app):
    """engine-tiers rule 13: a level is its position on the coach's ladder, 1 the best and consecutive,
    as the app's level rules count it, whatever the stored display orders; a level off the coach's
    ladder reaches the engine as ``None``. ``subscription_status`` is the account's status."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player

    store, (a,), (reg, x, y) = _seed(app)
    coach_id = store.coach_of(a)
    class_level = db.session.get(LessonInstance, int(a)).level_id
    db.session.get(CoachLevel, class_level).display_order = 30
    top = CoachLevel(coach_id=coach_id, label="N1", code="N1", display_order=10)
    other = User(name="Other", username="o916", password="x", status="active")
    db.session.add(other)
    db.session.flush()
    other_coach = Coach(user_id=other.id)
    db.session.add(other_coach)
    db.session.flush()
    stranger = CoachLevel(coach_id=other_coach.id, label="X", code="X", display_order=1)   # another coach's
    db.session.add_all([top, stranger])
    db.session.flush()
    links = {str(lk.player_id): lk for lk in Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()}
    links[x].level_id, links[y].level_id = top.id, stranger.id
    db.session.get(User, db.session.get(Player, int(y)).user_id).status = "inactive"
    db.session.commit()

    s = store.snapshot(a)
    assert s.level == 2
    assert {sid: s.students[sid].level for sid in (reg, x, y)} == {reg: 2, x: 1, y: None}
    assert (s.students[x].subscription_status, s.students[y].subscription_status) == ("active", "inactive")


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-4")
def test_the_coachs_approval_round_trips_through_the_store(app):
    """Engine-store rule 5, per group (owner decisions 5, 10): a request for group 1, its approval removing
    one student, a request for group 2, its dismissal (keeping the spot counts it saw), its reopening, a
    third request for group 2, its approval removing another, and a group-3 request withdrawn; after each
    the snapshot says so, and the outbox sends each request once."""
    from padel_app.services.engine_store import dispatch

    store, (a,), (_, x, y) = _seed(app)
    L = SpotType("L", 3)
    q = ((L, (x, y)),)

    def at(m):
        return NOW + timedelta(minutes=m)

    steps = [
        ([fx.ApprovalRequest(a, at(1), 1, q, "r1")], Approval(pending=(PendingRequest(1, "r1", q),))),
        ([fx.GroupApproved(a, at(2), 1, frozenset({y}))], Approval(approved_groups=frozenset({1}), removed=frozenset({y}))),
        ([fx.ApprovalRequest(a, at(3), 2, q, "r2")],
         Approval(approved_groups=frozenset({1}), removed=frozenset({y}), pending=(PendingRequest(2, "r2", q),))),
        ([fx.GroupDismissed(a, at(4), 2, ((L, 1),))],
         Approval(approved_groups=frozenset({1}), removed=frozenset({y}), dismissed_groups=((2, ((L, 1),)),))),
        ([fx.GroupReopened(a, at(5), 2)], Approval(approved_groups=frozenset({1}), removed=frozenset({y}))),
        ([fx.ApprovalRequest(a, at(6), 2, q, "r3")],
         Approval(approved_groups=frozenset({1}), removed=frozenset({y}), pending=(PendingRequest(2, "r3", q),))),
        ([fx.GroupApproved(a, at(7), 2, frozenset({x}))],
         Approval(approved_groups=frozenset({1, 2}), removed=frozenset({x, y}))),
        ([fx.ApprovalRequest(a, at(8), 3, q, "r4"), fx.ApprovalWithdrawn(a, at(9), 3, "r4")],
         Approval(approved_groups=frozenset({1, 2}), removed=frozenset({x, y}))),
    ]
    for effects, expected in steps:
        with store.unit((a,)):
            store.apply(effects)
        assert store.snapshot(a).approval == expected
    sent = []
    dispatch(lambda row: sent.append(row.payload["request"]) if row.kind == "ApprovalRequest" else None, now=NOW)
    assert sorted(sent) == ["r1", "r2", "r3", "r4"]
    assert dispatch(lambda row: sent.append(row), now=NOW) == 0




@pytest.mark.criterion("NOTIFICATIONS-CONFIG-64")
def test_a_class_with_no_level_applies_no_level_rule_of_the_bar(app):
    """Owner ruling D3 (engine-tiers rule 13): a class with no level applies no level rule, so the
    coach's eligibility bar keeps no one out of its pool on level, where today's bar fails everyone
    closed (PAD-86); the bar's other rules stand, so a student below its attendance rate stays out.
    With the class's level back, the level rule applies again."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence

    store, (a, past), (_, x, no_level, low) = _seed(app, starts=(START, START - timedelta(days=7)), players=4)
    coach_id = store.coach_of(a)
    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(no_level)).one().level_id = None
    with store.unit((past,)):
        store.apply([fx.Placed(past, NOW - timedelta(days=8), s, "L", "invitation") for s in (x, no_level, low)])
    for s, status in ((x, "present"), (no_level, "present"), (low, "absent")):          # attendance 100 %, 100 %, 0 %
        Presence.query.filter_by(lesson_instance_id=int(past), player_id=int(s)).one().status = status
    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, eligibility_rules=[
        {"attribute": "level", "operation": "within_n_above_class", "value": 0},
        {"attribute": "attendance_rate", "operation": "greater_than_or_equal", "value": 50}]))
    inst = db.session.get(LessonInstance, int(a))
    level_id = inst.level_id
    inst.level_id = None
    db.session.get(Lesson, inst.lesson_id).default_level_id = None
    db.session.commit()
    assert {st.id for st in store.snapshot(a).pool} == {x, no_level}
    inst.level_id = level_id
    db.session.commit()
    assert {st.id for st in store.snapshot(a).pool} == {x}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-19")
def test_the_students_own_blocks_hold_on_the_coachs_list(app):
    """Engine-tiers rule 4: the coach's list never overrides the student's own blocks. Of three students
    on the coach's list, one blocking automatic invitations, one blocking everything and one blocking
    only manual invitations, and a fourth with an availability blocker over the class, only the
    manual-only blocker is in ``pool`` and invited; the others are ``not_in_pool``."""
    from padel_app.invitation_engine import planner
    from padel_app.models import User
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.players import Player

    store, (a,), (_, auto, everything, manual, away) = _seed(app, players=5)

    def user(pid):
        return db.session.get(User, db.session.get(Player, int(pid)).user_id)

    for pid, column in ((auto, "notif_block_auto_invitations"), (everything, "notif_block_all"),
                        (manual, "notif_block_manual_invitations")):
        setattr(user(pid), column, True)
    db.session.add(CalendarBlock(user_id=user(away).id, type="unavailable", start_datetime=START - timedelta(hours=1),
                                 end_datetime=START + timedelta(hours=2), blocks_auto_invitations=True))
    db.session.commit()
    with store.unit((a,)):
        store.apply([fx.WaitingListJoined(a, NOW, s, "coach", "L") for s in (auto, everything, manual, away)])

    s = store.snapshot(a)
    assert {st.id for st in s.pool} == {manual}
    assert s.blocked == {auto, everything, away}
    assert s.students[everything].blocks_all and not s.students[manual].blocks_all
    run = planner.evaluate(s, EngineSettings(), START - timedelta(hours=6))
    invited = {e.student for e in run.effects if isinstance(e, fx.Invited)}
    assert invited == {manual}
    assert {v.student for v in run.verdicts if v.stage == "not_in_pool"} >= {auto, everything, away}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-5")
def test_a_student_the_system_recorded_as_coming_counts_as_confirmed(app):
    """Engine-store rule 6 (reminders rule 22, PAD-489): a class created after its reminder time has
    its students recorded as coming by the system; the snapshot counts them confirmed, so when the
    attendance request falls due nobody is asked."""
    from padel_app.invitation_engine import messages, timeline
    from padel_app.models.presences import Presence
    from padel_app.services.presence_response import record_response

    store, (a,), (reg, _, _) = _seed(app)
    due_at = timeline.attendance_request_at(store.snapshot(a), EngineSettings())
    assert [e.student for e in messages.due(store.snapshot(a), EngineSettings(), due_at)] == [reg]   # asked
    record_response(Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(reg)).one(),
                    "confirmed", recorded_by="system")
    db.session.commit()
    s = store.snapshot(a)
    assert s.confirmed == {reg}
    assert messages.due(s, EngineSettings(), due_at) == ()


@pytest.mark.criterion("NOTIFICATIONS-STUDENT-BLOCK-PREFERENCES-16")
def test_the_backstop_refuses_engine_invitations_to_a_student_who_blocked_everything(app):
    """Student-block-preferences rule 8 (new-engine section): at send time the outbox does not
    deliver a ``waiting_list_invite`` (nor an invitation) to a student with
    ``notif_block_all``; a ``sorry`` still is. A student without the block gets all of them."""
    from padel_app.models import User
    from padel_app.models.players import Player
    from padel_app.services.engine_store import dispatch

    store, (a,), (_, blocked, free) = _seed(app)
    db.session.get(User, db.session.get(Player, int(blocked)).user_id).notif_block_all = True
    db.session.commit()
    with store.unit((a,)):
        store.apply([fx.Message(a, NOW, s, kind) for s in (blocked, free)
                     for kind in ("waiting_list_invite", "sorry")])
    sent = []
    dispatch(lambda row: sent.append((row.player_id, row.payload["kind"])), now=NOW)
    assert sorted(sent) == sorted([(int(blocked), "sorry")] + [(int(free), k) for k in
                                                                ("waiting_list_invite", "sorry")])
    assert dispatch(lambda row: sent.append(row), now=NOW) == 0           # claimed, never retried



def test_a_session_belongs_to_the_occurrences_primary_coach(app):
    """``add_session`` writes the occurrence's coach as the app's ``primary_coach``: its first-assigned
    coach on a co-coached class, and the lesson's coach when the occurrence has no coach row of its own
    (``coaches_for``'s fallback), never a crash."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_store import TableStore

    store, (a,), _ = _seed(app)
    first = store.coach_of(a)
    other_user = User(name="Co", username="co916", password="x", status="active")
    db.session.add(other_user)
    db.session.flush()
    co = Coach(user_id=other_user.id)
    db.session.add(co)
    db.session.flush()
    inst = db.session.get(LessonInstance, int(a))
    twin = LessonInstance(lesson_id=inst.lesson_id, start_datetime=START + timedelta(days=7),
                          end_datetime=START + timedelta(days=7, hours=1), max_players=4, status="scheduled",
                          level_id=inst.level_id)
    bare = LessonInstance(lesson_id=inst.lesson_id, start_datetime=START + timedelta(days=14),
                          end_datetime=START + timedelta(days=14, hours=1), max_players=4, status="scheduled",
                          level_id=inst.level_id)
    db.session.add_all([twin, bare])
    db.session.flush()
    db.session.add_all([Association_CoachLessonInstance(coach_id=first, lesson_instance_id=twin.id),
                        Association_CoachLessonInstance(coach_id=co.id, lesson_instance_id=twin.id),
                        Association_CoachLesson(coach_id=co.id, lesson_id=inst.lesson_id)])
    db.session.commit()

    store = TableStore(clock=lambda: NOW)
    for sid in (str(twin.id), str(bare.id)):
        with store.unit((sid,)):
            store.add_session(sid, 3, 4, START, [], NOW, end=START + timedelta(hours=1))   # the protocol's end, unused
    assert store.coach_of(str(twin.id)) == first           # the coach assigned first
    assert store.coach_of(str(bare.id)) == co.id            # no row of its own: the lesson's coach



@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-7")
def test_every_message_of_an_invitation_follows_its_state(app, monkeypatch):
    """Engine-store rule 8 (invitations NB1a): the store keeps an invitation's bubbles and writes each new
    state, with ``startsAt`` and ``countsUntil``, one ``message_edited`` per message after the commit:
    ``sorry``; a reopening (``reopened`` on every bubble so far, ``reopened_at``) whose own bubble is
    attached after; then the coach's ``withdraw`` (``withdrawn``, ``closed_reason``) on the newest bubble
    only, the older keeping ``reopened``. Elsewhere an answer is
    ``answered`` with its response, and a same-hour placement ``closed_same_hour`` (``same_hour``)."""
    from padel_app import realtime
    from padel_app.models import Conversation, EngineInvitation, Message, User
    from padel_app.models.players import Player
    from padel_app.tools.unit_of_work import active

    edited = []
    monkeypatch.setattr(realtime, "publish", lambda event, users: edited.append((event["type"], event["payload"]["id"], active())))
    store, (a,), (reg, x, y, z) = _seed(app, players=4)
    with store.unit((a,)):
        store.apply([_invited(a, s) for s in (x, y, z)])

    def bubble(student):
        user_id = db.session.get(Player, int(student)).user_id
        conv = Conversation.get_or_insert([user_id, User.query.filter_by(username="c916").one().id])
        msg = Message(text="invite", sender_id=user_id, conversation_id=conv.id, message_type="notification_invite",
                      msg_metadata={"engine": "new", "state": "open"})
        db.session.add(msg)
        db.session.flush()
        store.attach_message(store.invitation_id(a, student), msg.id)
        db.session.commit()
        return msg.id

    def states(*mids):
        return [db.session.get(Message, m).msg_metadata["state"] for m in mids]

    first = bubble(x)
    with store.unit((a,)):
        store.apply([fx.Sorry(a, NOW + timedelta(minutes=1), x)])
    assert states(first) == ["sorry"] and db.session.get(Message, first).msg_metadata["startsAt"]
    with store.unit((a,)):
        store.apply([fx.Reopened(a, NOW + timedelta(minutes=2), x, frozenset({SpotType("L", 3)}), "L", 0,
                                  NOW + timedelta(minutes=30))])
    assert states(first) == ["reopened"]
    assert db.session.get(EngineInvitation, store.invitation_id(a, x)).reopened_at == NOW + timedelta(minutes=2)
    second = bubble(x)
    edited.clear()
    with store.unit((a,)):
        assert store.withdraw(store.invitation_id(a, x), NOW + timedelta(minutes=3))
    assert states(first, second) == ["reopened", "withdrawn"]          # the older bubble keeps "reopened"
    assert [m for _, m, _ in edited] == [second]
    assert all(kind == "message_edited" for kind, _, _ in edited)
    assert db.session.get(Message, second).msg_metadata["countsUntil"] == (NOW + timedelta(minutes=30)).isoformat()
    assert db.session.get(EngineInvitation, store.invitation_id(a, x)).closed_reason == "withdrawn"
    with store.unit((a,)):
        assert not store.withdraw(store.invitation_id(a, x), NOW + timedelta(minutes=4))    # already closed

    answered, same_hour = bubble(y), bubble(z)
    with store.unit((a,)):
        store.apply([fx.Answered(a, NOW + timedelta(minutes=5), y, "no", "invitation"),
                     fx.InvitationClosed(a, NOW + timedelta(minutes=5), z)])
    assert states(answered, same_hour) == ["answered", "closed_same_hour"]
    assert db.session.get(Message, answered).msg_metadata["response"] == "no"
    assert db.session.get(EngineInvitation, store.invitation_id(a, z)).closed_reason == "same_hour"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-8")
def test_an_alert_cleared_drops_the_alert(app):
    """Engine-planning rule 11 (PLANNING-40): an ``AlertCleared`` drops that type's alert, so the session
    keeps only live ones."""
    store, (a,), _ = _seed(app)
    left, right = SpotType("L", 3), SpotType("R", 3)
    with store.unit((a,)):
        store.apply([fx.CoachAlert(a, NOW, reason="no_candidate", spot_type=left, spots=1),
                     fx.CoachAlert(a, NOW, reason="no_candidate", spot_type=right, spots=2)])
    with store.unit((a,)):
        store.apply([fx.AlertCleared(a, NOW + timedelta(minutes=1), left)])
    assert store.snapshot(a).alerted == {right: 2}


def test_the_request_message_says_how_the_request_ended(app, monkeypatch):
    """Semi-auto-approval N4 (the store's half of SEMI-AUTO-APPROVAL-43), per group: a request's Assistant
    message, attached only while that request is pending, says ``replaced``, ``approved`` or
    ``dismissed`` with ``responded`` true when it stops being pending, one ``message_edited`` each; a
    re-raise of the same request leaves it alone, and clearing the approved groups edits nothing."""
    from padel_app import realtime
    from padel_app.models import Conversation, Message, User

    edited = []
    monkeypatch.setattr(realtime, "publish", lambda event, users: edited.append(event["payload"]["id"]))
    store, (a,), (_, x, _) = _seed(app)
    q = ((SpotType("L", 3), (x,)),)
    coach_user = User.query.filter_by(username="c916").one().id
    conv = Conversation.get_or_insert([coach_user])

    def request(tier, rid, minute):
        with store.unit((a,)):
            store.apply([fx.ApprovalRequest(a, NOW + timedelta(minutes=minute), tier, q, rid)])
        msg = Message(text="request", sender_id=coach_user, conversation_id=conv.id,
                      message_type="replacement_approval", msg_metadata={"requestId": rid, "state": "pending"})
        db.session.add(msg)
        db.session.flush()
        attached = store.attach_request_message(a, rid, msg.id)
        db.session.commit()
        return msg.id, attached

    def meta(mid):
        return db.session.get(Message, mid).msg_metadata

    first, ok = request(1, "r1", 1)
    assert ok and not store.attach_request_message(a, "r0", first)          # only a pending request
    with store.unit((a,)):
        store.apply([fx.ApprovalRequest(a, NOW + timedelta(minutes=2), 1, q, "r1")])   # the same one again
    assert meta(first)["state"] == "pending" and edited == []
    second, _ = request(1, "r2", 3)
    assert (meta(first)["state"], meta(first)["responded"]) == ("replaced", True) and edited == [first]
    with store.unit((a,)):
        store.apply([fx.GroupApproved(a, NOW + timedelta(minutes=4), 1, frozenset())])
    assert (meta(second)["state"], meta(second)["responded"]) == ("approved", True)
    third, _ = request(2, "r3", 5)
    with store.unit((a,)):
        store.apply([fx.GroupDismissed(a, NOW + timedelta(minutes=6), 2, ((SpotType("L", 3), 1),))])
    assert meta(third)["state"] == "dismissed"
    edited.clear()
    with store.unit((a,)):
        store.apply([fx.GroupsCleared(a, NOW + timedelta(minutes=7))])
    assert edited == [] and store.snapshot(a).approval.approved_groups == frozenset()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-9")
def test_the_snapshot_carries_each_sessions_end(app):
    """Engine-store rule 4, engine-tiers rule 3 (owner decision 11, the 11-11 ruling kept): a 90-minute
    occurrence at 18:00 runs to 19:30, so a student going to it is busy for the same coach's 19:00 session;
    one that only touches (19:30) is not, and the store refuses a placement into the overlapping session
    (engine-answers rule 10). Another coach's class makes the student busy only at the same start."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.engine_store import SameHourConflict

    six = START.replace(hour=18)
    nine = six + timedelta(hours=3)
    store, (a, b, c, same, overlap), (_, x, _) = _seed(
        app, starts=(six, six + timedelta(hours=1), six + timedelta(minutes=90), nine, nine + timedelta(minutes=30)))
    db.session.get(LessonInstance, int(a)).end_datetime = six + timedelta(minutes=90)
    db.session.commit()
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, x, "L", "invitation")])

    assert store.snapshot(a).end == six + timedelta(minutes=90)
    assert x in store.snapshot(b).busy_same_time and store.snapshot(b).end == six + timedelta(hours=2)
    assert x not in store.snapshot(c).busy_same_time                       # touching ends do not overlap
    with pytest.raises(SameHourConflict), store.unit((b,)):
        store.apply([fx.Placed(b, NOW, x, "L", "invitation")])
    with store.unit((c,)):
        store.apply([fx.Placed(c, NOW, x, "L", "invitation")])
    assert x in {p.student for p in store.snapshot(c).going}

    other = User(name="Other", username="o916b", password="x", status="active")
    db.session.add(other)
    db.session.flush()
    other_coach = Coach(user_id=other.id)
    db.session.add(other_coach)
    db.session.flush()
    first = db.session.get(LessonInstance, int(a))
    theirs = LessonInstance(lesson_id=first.lesson_id, start_datetime=nine, end_datetime=nine + timedelta(hours=1),
                            max_players=4, status="scheduled", level_id=first.level_id)
    db.session.add(theirs)
    db.session.flush()
    db.session.add_all([Association_CoachLessonInstance(coach_id=other_coach.id, lesson_instance_id=theirs.id),
                        Presence(lesson_instance_id=theirs.id, player_id=int(x), enrolment_source="fill")])
    db.session.commit()
    assert x in store.snapshot(same).busy_same_time                         # another coach, the same start
    assert x not in store.snapshot(overlap).busy_same_time                  # another coach, only overlapping



@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-10")
def test_a_no_show_stays_placed(app):
    """Engine-store rule 4: a presence is going unless the engine recorded the student leaving (absent
    with ``left_reason`` ``regular_no`` or ``cancel``). A no-show and the coach's absent mark after the
    class has started record attendance: the student keeps the spot (scenarios 60, P16). The coach's
    absent mark before the start is a leaving (attendance.confirm rule 13): PAD-918's entry point sends
    it to the engine first, as the regular's absence or a cancel, so the student is not going."""
    from padel_app.models.presences import Presence

    store, (a,), (reg, x, y, z) = _seed(app, players=4)
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, s, "L", "invitation") for s in (x, y, z)])
    after = START + timedelta(hours=2)
    with store.unit((a,)):
        store.apply([fx.Absence(a, after, x, "late"), fx.Left(a, after, x, "no_show")])
    Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(y)).one().status = "absent"   # the sheet, after
    db.session.commit()
    assert {p.student for p in store.snapshot(a).going} == {reg, x, y, z}

    before = START - timedelta(hours=3)                    # the coach's marks before the start, through the engine
    with store.unit((a,)):
        store.apply([fx.Absence(a, before, reg, "late"), fx.Left(a, before, reg, "regular_no"),
                     fx.Absence(a, before, z, "late"), fx.Left(a, before, z, "cancel")])
    for pid in (reg, z):
        Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(pid)).one().status = "absent"
    db.session.commit()
    going = {p.student for p in store.snapshot(a).going}
    assert going == {x, y} and reg in store.snapshot(a).absent



def test_elsewhere_says_whose_session_it_is(app):
    """Engine-tiers rule 3: each ``Elsewhere`` (an open invitation in another session that club day)
    carries ``same_coach``, so the engine reads the same coach's session as at the same time when it
    overlaps and another coach's only at the same start."""
    from padel_app.models import EngineSession, User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.coaches import Coach

    six = START.replace(hour=18)
    store, (a, b, c), (_, x, _) = _seed(app, starts=(six, six + timedelta(hours=1), six + timedelta(hours=2)))
    other = User(name="Other", username="o916c", password="x", status="active")
    db.session.add(other)
    db.session.flush()
    other_coach = Coach(user_id=other.id)
    db.session.add(other_coach)
    db.session.flush()
    Association_CoachLessonInstance.query.filter_by(lesson_instance_id=int(c)).one().coach_id = other_coach.id
    db.session.get(EngineSession, int(c)).coach_id = other_coach.id
    db.session.commit()
    for sid in (b, c):
        with store.unit((sid,)):
            store.apply([_invited(sid, x)])
    by_session = {e.session: e.same_coach for e in store.snapshot(a).elsewhere}
    assert by_session == {b: True, c: False}
