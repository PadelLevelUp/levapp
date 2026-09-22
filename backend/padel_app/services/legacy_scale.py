"""PAD-403 (evaluations.legacy-conversion): the ONE mapping between the legacy
1–10 evaluation scale and the 1–5 star scale the new evaluation system rates on
everywhere.

**Owner decision, 2026-09-22 (Q1, the non-default).** Every legacy 1–10 score
becomes 1–5 stars in one data migration (``migrations/versions/*_pad403_legacy_scores_to_stars.py``),
with this one fixed mapping, and the 1–10 scale is dropped. Not coach-triggered,
not per category — see ``.specflow/specs/evaluations/legacy-conversion.spec.md``
rule 1.

The mapping, pinned value by value (rule 1: ``stars = ceil(score / 2)``)::

    score:  1  2  3  4  5  6  7  8  9  10
    stars:  1  1  2  2  3  3  4  4  5  5

It is the proportional rescale ``round_half_up(1 + (score − 1) × 4/9)`` and the
"half the scale" reading at once; it sends the App Store builds' untouched
midpoint 6 to 3★; and it round-trips with ``score = 2 × stars``.

This is **THE** one mapping (R-048): no client re-derives it. The migration,
the frozen-endpoint presentation layer (rule 7, pending) and any other reader
must call ``to_stars``/``to_legacy`` from here — never recompute the ratio.
"""


def to_stars(score: int) -> int:
    """Legacy 1–10 score -> 1–5 stars: ``ceil(score / 2)``, pinned value by value.

    Uses integer arithmetic (``(score + 1) // 2``) so it is exact for every
    engine and never touches floating point.
    """
    if not isinstance(score, int) or isinstance(score, bool) or not (1 <= score <= 10):
        raise ValueError(f"legacy score out of range 1-10: {score!r}")
    return (score + 1) // 2


def to_legacy(stars: int) -> int:
    """1–5 stars -> legacy 1–10 score: ``2 * stars``. The inverse of ``to_stars``
    at every star value (round-trips through the untouched midpoint 6 <-> 3★).
    """
    if not isinstance(stars, int) or isinstance(stars, bool) or not (1 <= stars <= 5):
        raise ValueError(f"stars out of range 1-5: {stars!r}")
    return 2 * stars
