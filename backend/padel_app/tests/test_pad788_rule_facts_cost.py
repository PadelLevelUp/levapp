"""
PAD-788 (B-712) — a wave whose rules read per-student facts still costs a bounded number of
statements (notifications.invitations rule 12).

PAD-276 batched the roster, the availability blockers and the ranking's attendance, and its test
used the default groups (level and side). The facts other rules read stayed per student: the
unjustified-absence bar, ``has_makeups`` and the level-step operations each asked the database
for one student at a time, and the absence and make-up counts reloaded the coach's whole set of
occurrences on every call. A coach with eight groups using those rules paid about 190 statements
per wave on a 166-student roster, for every spot of the class and every group, in one tick.

The verdicts must not change: each student's stage is the one the per-student evaluator gives.
"""
from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.test_pad276_engine_query_cost import _seed

GROUPS = [
    {"id": "1", "rules": [{"attribute": "level", "operation": "one_above_vacancy"},
                          {"attribute": "side", "operation": "same_as_vacancy"},
                          {"attribute": "has_makeups", "operation": "is_true"}]},
    {"id": "2", "rules": [{"attribute": "level", "operation": "same_as_vacancy"},
                          {"attribute": "has_makeups", "operation": "is_true"}]},
    {"id": "3", "rules": [{"attribute": "level", "operation": "one_above_vacancy"}]},
    {"id": "4", "rules": [{"attribute": "level", "operation": "same_as_vacancy"},
                          {"attribute": "subscription_status", "operation": "equals", "value": "active"}]},
]
BAR = [{"attribute": "unjustified_absences", "operation": "less_than", "value": 2}]


def _shape(ids):
    """The rule set above, and a justified absence for every third student so ``has_makeups``
    passes for some and fails for others."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence

    cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
    cfg.invitation_groups = GROUPS
    cfg.eligibility_rules = BAR
    for i, pid in enumerate(ids["player_ids"]):
        if i % 3 == 0:
            p = Presence.query.filter_by(player_id=pid, status="absent").first()
            if p is not None:
                p.justification = "justified"
    db.session.commit()


class _Count:
    def __init__(self):
        self.n = 0

    def __call__(self, conn, cursor, statement, parameters, context, executemany):
        self.n += 1


def _waves(app, ids):
    """Statements issued by evaluating every group of the vacancy, and the verdicts per group."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    vacancy = Vacancy.query.get(ids["vacancy_id"])
    instance = LessonInstance.query.get(ids["instance_id"])
    config = ns.get_or_create_config(ids["coach_id"])
    db.session.expire_all()

    counter = _Count()
    engine = db.get_engine(app)
    event.listen(engine, "before_cursor_execute", counter)
    try:
        verdicts = {g: ns.evaluate_candidates(vacancy, instance, ids["coach_id"], config, wave=("group", g))
                    for g in range(1, len(GROUPS) + 1)}
    finally:
        event.remove(engine, "before_cursor_execute", counter)
    return counter.n, verdicts


def test_a_wave_with_fact_rules_costs_the_same_for_a_big_roster(app):
    with app.app_context():
        small = _seed(20)
        _shape(small)
        n_small, _ = _waves(app, small)
        db.session.remove()
        big = _seed(40)
        _shape(big)
        n_big, _ = _waves(app, big)

    # Before the fix every student cost statements of their own in every group (the absence bar,
    # the make-up count and the coach's occurrence set behind both, the level ladder), so 20 more
    # students cost hundreds more statements. After: the same handful per group.
    assert n_big <= n_small + 2 * len(GROUPS), (n_small, n_big)
    assert n_big < 30 * len(GROUPS), n_big


def test_the_verdicts_are_the_per_student_evaluators(app):
    """Each student's stage is what the per-student path (no shared facts) says."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    with app.app_context():
        ids = _seed(24)
        _shape(ids)
        _, verdicts = _waves(app, ids)
        vacancy = Vacancy.query.get(ids["vacancy_id"])
        instance = LessonInstance.query.get(ids["instance_id"])
        seen = set()
        for g, vs in verdicts.items():
            rules = GROUPS[g - 1]["rules"]
            for v in vs:
                eligible = ns.passes_eligibility(v.cp, instance, ids["coach_id"], BAR)
                if not eligible:
                    assert v.stage == "eligibility", (g, v.cp.player_id, v.stage)
                    seen.add("eligibility")
                    continue
                if v.stage in ("invited", "no_round_matched"):
                    matches = ns._passes_group_rules(rules, v.cp, vacancy, ids["coach_id"], instance)
                    assert (v.stage == "invited") == matches, (g, v.cp.player_id, v.stage)
                    seen.add(v.stage)
        # The rule set splits the roster: some students fail the bar, some match a group, some none.
        assert {"eligibility", "invited", "no_round_matched"} <= seen, seen
