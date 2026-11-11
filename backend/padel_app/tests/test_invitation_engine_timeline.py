"""notifications.engine-timeline (PAD-906, wave W1): an invitation's T, fixed at send.

TIMELINE-2 runs a whole engine; the others call the T-at-send function.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.settings import Timing, TimingPair
from padel_app.invitation_engine.timeline import counts_until, t_at_send

SENT = datetime(2026, 11, 1, 19, 0)


def test_equal_settings_are_the_single_t():
    t = timedelta(minutes=45)
    settings = EngineSettings(timing=Timing("fixed", t, t))
    assert {t_at_send(settings, tier, left) for tier in range(4) for left in (True, False)} == {t}
    assert counts_until(settings, SENT, t) == SENT + t


def test_t_at_send_picks_between_rounds_while_the_tier_has_uninvited_candidates():
    settings = EngineSettings(timing=Timing("per_tier", timedelta(minutes=20), timedelta(hours=1),
                                            (None, TimingPair(timedelta(minutes=5), timedelta(minutes=30)))))
    assert t_at_send(settings, 0, True) == timedelta(minutes=20)
    assert t_at_send(settings, 0, False) == timedelta(hours=1)
    assert t_at_send(settings, 1, True) == timedelta(minutes=5)
    assert t_at_send(settings, 1, False) == timedelta(minutes=30)
    progressive = EngineSettings(timing=Timing("progressive"))
    assert t_at_send(progressive, 2, True, method_b_share=timedelta(hours=3)) == timedelta(hours=3)


def test_t_at_send_follows_the_tier_state():
    from padel_app.invitation_engine import Engine, MemoryStore
    from padel_app.invitation_engine import effects as fx
    from padel_app.invitation_engine.settings import Tier
    from padel_app.invitation_engine.snapshot import Student

    settings = EngineSettings(timing=Timing("fixed", timedelta(minutes=20), timedelta(hours=1)),
                              tiers=(Tier("pool", "same", 0), Tier("pool", "other", 0)))
    store = MemoryStore()
    for i in range(1, 5):
        store.add_student(Student(f"R{i}", 3, frozenset({"R"})))
    store.add_student(Student("L1", 3, frozenset({"L"})))
    store.add_session("A", 3, 8, datetime(2026, 11, 3, 10, 30),
                      [(Student(f"L-{i}", 3, frozenset({"L"})), "L") for i in range(1, 5)]
                      + [(Student(f"R-{i}", 3, frozenset({"R"})), "R") for i in range(1, 4)], SENT)
    engine = Engine(store, settings)

    def sent(at):
        return [(e.student, e.tier, e.counts_until) for e in engine.tick(at) if isinstance(e, fx.Invited)]

    first = sent(SENT)
    assert [(s, t) for s, t, _ in first] == [("R1", 0), ("R2", 0), ("R3", 0)]
    assert {u for *_, u in first} == {SENT + timedelta(minutes=20)}     # the tier still has R4: between_rounds
    assert sent(SENT + timedelta(minutes=19)) == []
    assert sent(SENT + timedelta(minutes=20)) == [("R4", 0, SENT + timedelta(hours=1, minutes=20))]  # tier emptied
    assert sent(SENT + timedelta(hours=1, minutes=19)) == []
    assert [(s, t) for s, t, _ in sent(SENT + timedelta(hours=1, minutes=20))] == [("L1", 1)]     # the next tier
