"""PAD-403 (evaluations.legacy-conversion rule 1): the ONE score<->stars mapping,
pinned value by value — no proportional formula, no re-derivation.

    score:  1  2  3  4  5  6  7  8  9  10
    stars:  1  1  2  2  3  3  4  4  5  5
"""
import pytest

from padel_app.services.legacy_scale import to_legacy, to_stars


@pytest.mark.parametrize(
    "score, stars",
    [
        (1, 1),
        (2, 1),
        (3, 2),
        (4, 2),
        (5, 3),
        (6, 3),
        (7, 4),
        (8, 4),
        (9, 5),
        (10, 5),
    ],
)
def test_to_stars_is_pinned_value_by_value(score, stars):
    assert to_stars(score) == stars


@pytest.mark.parametrize(
    "stars, score",
    [
        (1, 2),
        (2, 4),
        (3, 6),
        (4, 8),
        (5, 10),
    ],
)
def test_to_legacy_is_pinned_value_by_value(stars, score):
    assert to_legacy(stars) == score


@pytest.mark.parametrize("score", [0, 11])
def test_to_stars_rejects_out_of_range(score):
    with pytest.raises(ValueError):
        to_stars(score)


@pytest.mark.parametrize("stars", [0, 6])
def test_to_legacy_rejects_out_of_range(stars):
    with pytest.raises(ValueError):
        to_legacy(stars)
