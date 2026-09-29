"""
PAD-425: "Convidar" in the coach's "Próximos 7 dias" opens the class's invite flow, the same
place "Convidar x jogadores" in "Precisa de ti" goes (`class_href(event) + "&notify=1"`), not
just the class. The server owns the link so both buttons share one convention.

Run:
    pytest padel_app/tests/test_pad425_schedule_invite_href.py -v
"""
from datetime import datetime

from padel_app.tests.test_dashboard_coach_home import _seed


def test_every_coach_schedule_row_links_to_the_invite_flow(app):
    from padel_app.helpers.dashboard.coach_home import build_schedule_block

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, _, _ = _seed(app, now=now)
    with app.app_context():
        items = build_schedule_block(coach_id=coach_id, now=now)["data"]["items"]

    assert items, "the seed schedules upcoming classes"
    for item in items:
        assert item["inviteHref"] == item["href"] + "&notify=1"


def test_the_invite_link_matches_the_needs_you_empty_seats_link(app):
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block, build_schedule_block

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    with app.app_context():
        rows = {i["href"]: i for i in build_schedule_block(coach_id=coach_id, now=now)["data"]["items"]}
        queue = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now)["data"]["items"]

    seats = [q for q in queue if q["kind"] == "empty_seats"]
    assert seats, "the seed has a class with empty seats"
    matched = [q for q in seats if q["href"].removesuffix("&notify=1") in rows]
    assert matched, "an empty-seats class is also in the 7-day schedule"
    for q in matched:
        assert rows[q["href"].removesuffix("&notify=1")]["inviteHref"] == q["href"]


def test_student_schedule_rows_carry_no_invite_link():
    from padel_app.helpers.dashboard.coach_home import schedule_block

    event = {"id": "lessoninstance-7", "title": "A", "date": "2026-08-05", "startTime": "10:00", "endTime": "11:00"}
    block = schedule_block([event])  # the student dashboard's call: no invite flag
    assert "inviteHref" not in block["data"]["items"][0]
