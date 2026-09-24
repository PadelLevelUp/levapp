"""
PAD-420 (B-178) — the "Playing side" ranking criterion must not favour a side
when the vacancy has none.

A structural vacancy (a never-filled spot, `_create_structural_vacancies`) has
`side=None`. The side-less branch of `_build_sort_key` used to append
`0 if cp.side == "left" else 1`, so with the criterion enabled every left-side
player outranked every right-side player for those spots.

Covered spec: notifications.invitations rule 4b (its PAD-420 sentence) and the criterion
"The playing-side tiebreaker favours no side for a vacancy with no side".

Run:
    pytest padel_app/tests/test_pad420_side_sort_no_side.py -v
"""
from types import SimpleNamespace

import pytest

SIDE_ONLY = [{"id": "playing_side", "enabled": True}]


def _player(player_id, side):
    return SimpleNamespace(player_id=player_id, side=side)


@pytest.fixture
def build_sort_key():
    from padel_app.services.notification_service import _build_sort_key
    return _build_sort_key


def test_side_criterion_ranks_every_side_equal_for_a_vacancy_with_no_side(build_sort_key):
    key = build_sort_key(SIDE_ONLY, {}, SimpleNamespace(side=None, coach_id=None))

    keys = {side: key(_player(i, side)) for i, side in enumerate(("left", "right", "both", None))}

    assert len(set(keys.values())) == 1, keys


def test_a_right_side_player_listed_first_stays_first_for_a_vacancy_with_no_side(build_sort_key):
    key = build_sort_key(SIDE_ONLY, {}, SimpleNamespace(side=None, coach_id=None))
    right, left = _player(1, "right"), _player(2, "left")

    ranked = sorted([right, left], key=key)

    assert [cp.player_id for cp in ranked] == [1, 2]


def test_a_sided_vacancy_still_prefers_the_exact_side(build_sort_key):
    key = build_sort_key(SIDE_ONLY, {}, SimpleNamespace(side="right", coach_id=None))
    left, both, right = _player(1, "left"), _player(2, "both"), _player(3, "right")

    ranked = sorted([left, both, right], key=key)

    assert [cp.player_id for cp in ranked] == [3, 2, 1]
