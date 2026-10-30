"""PAD-797 (dashboard.blocks rule 12c): with two or more classes running at once, the coach's hero
shows every one of them.

PAD-792 made a running class "A DECORRER" and, with two running (two courts), kept only the one that
started first, pending the owner. The owner's decision (2026-10-30): show both. The hero block keeps
the first running class as its own data, so a build that predates PAD-797 still shows that one, and
`alsoRunning` carries the others, each with its own start, end and link. One running class, or none,
is unchanged.

The clock is the club's wall clock (R-023), pinned: Thursday 29 Oct 2026, 20:23.
"""
from datetime import datetime

from padel_app.helpers.dashboard.coach_home import next_class_block

NOW = datetime(2026, 10, 29, 20, 23)


def _class(id_, title, start, end, date="2026-10-29"):
    return {"type": "class", "id": id_, "title": title, "date": date, "startTime": start, "endTime": end,
            "href": f"/calendar?classId={id_}&date={date}"}


EARLIER = _class("lessoninstance-1", "Treino A", "19:30", "21:00")
LATER = _class("lessoninstance-2", "Treino B", "20:00", "21:00")
THIRD = _class("lessoninstance-3", "Treino C", "20:15", "21:15")
UPCOMING = _class("lessoninstance-4", "Treino D", "21:30", "22:30")


def test_two_running_classes_both_reach_the_hero():
    block = next_class_block([EARLIER, LATER, UPCOMING], now=NOW)

    data = block["data"]
    assert data["title"] == "Treino A" and data["inProgress"] is True
    assert [c["title"] for c in data["alsoRunning"]] == ["Treino B"]
    (other,) = data["alsoRunning"]
    assert other["classId"] == "lessoninstance-2"
    assert (other["startTime"], other["endTime"]) == ("20:00", "21:00")
    assert other["inProgress"] is True and other["minutesUntil"] is None
    assert other["href"] == "/calendar?classId=lessoninstance-2&date=2026-10-29"
    assert "alsoRunning" not in other


def test_three_running_classes_are_three_cards_in_start_order():
    block = next_class_block([EARLIER, LATER, THIRD, UPCOMING], now=NOW)

    assert block["data"]["title"] == "Treino A"
    assert [c["title"] for c in block["data"]["alsoRunning"]] == ["Treino B", "Treino C"]


def test_one_running_class_is_unchanged_from_pad792():
    block = next_class_block([EARLIER, UPCOMING], now=NOW)

    assert block["data"]["title"] == "Treino A" and block["data"]["inProgress"] is True
    assert "alsoRunning" not in block["data"], "a class still to come is never an in-progress card"


def test_nothing_running_the_hero_is_the_next_class_alone():
    block = next_class_block([UPCOMING], now=NOW)

    assert block["data"]["title"] == "Treino D" and block["data"]["inProgress"] is False
    assert "alsoRunning" not in block["data"]


def test_a_class_at_its_start_minute_is_running():
    """The cut is rule 12's: start at or before `now`."""
    at_start = _class("lessoninstance-5", "Treino E", "20:23", "21:23")

    block = next_class_block([EARLIER, at_start], now=NOW)

    assert [c["title"] for c in block["data"]["alsoRunning"]] == ["Treino E"]
