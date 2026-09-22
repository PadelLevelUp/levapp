"""
PAD-372 / B-138 — the open question answered by RUNNING, not reading: does `_busy_by_day`
count an EXISTING clone of a live hold as busy time against that same student's own
counter-proposal?

Session-C read `_busy_by_day` as excluding only the request's own `hold_block_id`, so a
clone (a hold-titled block no request points at, left by a pre-refusal move) would stay
busy for the very student whose request it came from. This file pins what the code does.

Clones can no longer be made through the routes (this ticket refuses the gesture), so the
population is fixed: the rows already on production, counted separately by PAD-360's v2
scan. Nothing here is a fix — it is the answer, so the cleanup decision has a fact to rest
on. The clone is made the way the old code made it (`_clone_block` on the hold itself).

Covered spec: classes.class-requests rule 1 (free blocks) and rule 3.
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import DAY, _coach, _setup
from padel_app.tests.test_pad360_request_hold_release import _weekly_request


def _free_slots_on(app, ids, rid, day):
    from padel_app.services.class_request_service import free_blocks

    with app.app_context():
        start = datetime.combine(day, datetime.min.time())
        blocks = free_blocks(_coach(ids), start, start + timedelta(days=1),
                             now=start - timedelta(days=1), exclude_request_id=rid)
        return [(b["startTime"], b["endTime"]) for b in blocks if b["date"] == day.isoformat()]


def _covers(slots, start, end):
    return any(s <= start and e >= end for s, e in slots)


def test_the_requests_own_hold_is_not_busy_for_its_student(app):
    """Control: rule 1's exclusion — the student's own 11:00–12:00 is offered back to them."""
    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    assert _covers(_free_slots_on(app, ids, rid, DAY), "11:00", "12:00")


def test_an_existing_clone_of_the_hold_IS_busy_for_the_same_student(app):
    """A one-off clone at a LATER occurrence's slot (what a pre-refusal `single` move left
    behind) is not the request's `hold_block_id`, so `_busy_by_day` keeps it: the student
    who owns the request cannot counter-propose onto their own clone's slot."""
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.services.calendar_service import _clone_block

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    clone_day = DAY + timedelta(days=14)
    with app.app_context():
        src = db.session.get(CalendarBlock, hold)
        _clone_block(src, user_id=src.user_id,
                     start_datetime=datetime.combine(clone_day, datetime.min.time()).replace(hour=15),
                     end_datetime=datetime.combine(clone_day, datetime.min.time()).replace(hour=16),
                     is_recurring=False, recurrence_rule=None, recurrence_end=None)
        db.session.commit()

    slots = _free_slots_on(app, ids, rid, clone_day)
    assert _covers(slots, "11:00", "12:00"), "the hold's own occurrence that day is still offered (control)"
    assert not _covers(slots, "15:00", "16:00"), "the clone's slot is busy for its own student — the answer"
