"""
PAD-481 — "up to N levels away" looks above, below, or both; B-257 — an unknown
level operation used to pass everyone.

Covered specs:
  eligibility.rules — rule 6 (operations, direction, worked example, unknown
  operation, save validation)

The ladder here has eight levels, strongest first, and the class sits at ladder
index 3 — the worked example in rule 6. Codes are chosen so the shared `_seed`
(which puts the class at level "5") lands it there.

Run:
    pytest padel_app/tests/test_pad481_level_direction.py -v
"""
import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _seed, _add_student, _cp

# Index 0 is the strongest level (level_ladder.py:6). "5" is index 3: the class.
LADDER = ("a", "b", "c", "5", "d", "e", "f", "g")
CLASS_INDEX = 3


def _rule(operation, value=None):
    rule = {"attribute": "level", "operation": operation}
    if value is not None:
        rule["value"] = value
    return rule


def _passing_indexes(app, rules):
    """Seed the 8-level ladder with one student per level; return the ladder
    indexes that pass `rules` for the class at index 3."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import passes_eligibility

    ids = _seed(app, levels=LADDER, eligibility_rules=rules)
    with app.app_context():
        instance = db.session.get(LessonInstance, ids["instance_id"])
        students = {
            index: _add_student(ids["coach_id"], f"s{index}", ids["level_ids"][code])
            for index, code in enumerate(LADDER)
        }
        db.session.commit()
        return {
            index for index, pid in students.items()
            if passes_eligibility(_cp(ids["coach_id"], pid), instance, ids["coach_id"], rules)
        }


# ---------------------------------------------------------------------------
# Rule 6 — the worked example
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "operation,expected",
    [
        ("within_n_of_class", {1, 2, 3, 4, 5}),
        ("within_n_above_class", {1, 2, 3}),   # stronger = lower index, plus the class's own
        ("within_n_below_class", {3, 4, 5}),   # weaker = higher index, plus the class's own
    ],
)
@pytest.mark.criterion("ELIGIBILITY-RULES-4")
def test_within_n_looks_above_below_or_both(app, operation, expected):
    """eligibility.rules rule 6 / AC "Within N looks above, below, or both"."""
    assert _passing_indexes(app, [_rule(operation, 2)]) == expected


@pytest.mark.parametrize(
    "operation,expected",
    [
        ("equal_or_above_class", {0, 1, 2, 3}),
        ("equal_or_below_class", {3, 4, 5, 6, 7}),
        ("one_below_or_above_class", {2, 3, 4}),
        ("same_as_class", {3}),
    ],
)
def test_the_existing_operations_keep_their_recipients(app, operation, expected):
    """Rule 6's reference rows: PAD-481 changes none of the existing operations."""
    assert _passing_indexes(app, [_rule(operation)]) == expected


@pytest.mark.parametrize("operation", ["within_n_of_class", "within_n_above_class", "within_n_below_class"])
@pytest.mark.criterion("ELIGIBILITY-RULES-5")
def test_n_zero_is_the_class_level_only(app, operation):
    """AC "N = 0 is the class's level only"."""
    assert _passing_indexes(app, [_rule(operation, 0)]) == {CLASS_INDEX}


def test_n_sent_as_a_string_counts_as_the_number(app):
    """Rule 6: `value` is an integer; a client that sends "2" gets the same recipients as 2."""
    assert _passing_indexes(app, [_rule("within_n_above_class", "2")]) == {1, 2, 3}


# ---------------------------------------------------------------------------
# Rule 6 — a level outside the ladder, and an unknown operation (B-257)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "operation,value",
    [("within_n_of_class", 7), ("within_n_above_class", 7), ("within_n_below_class", 7), ("equal_or_below_class", None)],
)
@pytest.mark.criterion("ELIGIBILITY-RULES-6")
def test_a_level_outside_the_ladder_never_passes(app, operation, value):
    """AC "A level outside the ladder never passes" — today's behaviour, now pinned."""
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import eligibility_failures

    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        from padel_app.models import User
        from padel_app.models.coaches import Coach

        other_user = User(name="Other", username="other_coach", password="x", status="active")
        db.session.add(other_user)
        db.session.flush()
        other = Coach(user_id=other_user.id)
        db.session.add(other)
        db.session.flush()
        # A level from ANOTHER coach's ladder.
        foreign = CoachLevel(coach_id=other.id, label="X", code="X", display_order=1)
        db.session.add(foreign)
        db.session.flush()
        stranger = _add_student(ids["coach_id"], "stranger", foreign.id)
        db.session.commit()
        instance = db.session.get(LessonInstance, ids["instance_id"])

        (failure,) = eligibility_failures(
            _cp(ids["coach_id"], stranger), instance, ids["coach_id"], [_rule(operation, value)])
        assert failure["reason"] == "level_not_in_ladder"


@pytest.mark.criterion("ELIGIBILITY-RULES-7")
def test_an_unknown_level_operation_fails_everyone_and_says_so(app):
    """AC "An unknown level operation fails everyone, and says so" (B-257).

    It used to match no branch and pass silently — every student cleared a bar
    the coach had set.
    """
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import eligibility_failures

    rules = [_rule("made_up_operation", 2)]
    assert _passing_indexes(app, rules) == set()

    with app.app_context():
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

        instance = LessonInstance.query.first()
        cp = Association_CoachPlayer.query.first()
        (failure,) = eligibility_failures(cp, instance, cp.coach_id, rules)
        assert failure["reason"] == "unknown_operation"
        assert failure["operation"] == "made_up_operation"


def test_the_impact_scan_names_students_failing_an_unknown_operation(app):
    """Rule 6: the unknown-operation failure is reported where failures are shown —
    the save impact scan lists the enrolled students it would exclude."""
    from padel_app.models import Presence
    from padel_app.services.notification_service import students_failing_eligibility_bar

    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        enrolled = _add_student(ids["coach_id"], "enrolled", ids["level_ids"]["5"])
        db.session.add(Presence(
            player_id=enrolled, lesson_instance_id=ids["instance_id"], invited=True,
            enrolment_source="coach"))
        db.session.commit()

        (entry,) = students_failing_eligibility_bar(ids["coach_id"], [_rule("made_up_operation")])
        assert entry["playerId"] == enrolled
        assert [f["reason"] for f in entry["failures"]] == ["unknown_operation"]


# ---------------------------------------------------------------------------
# Rule 6 — saving
# ---------------------------------------------------------------------------

@pytest.mark.criterion("ELIGIBILITY-RULES-8")
def test_saving_rejects_an_unknown_level_operation(app):
    """AC "Saving rejects an unknown level operation …" — coach tier."""
    from padel_app.services.notification_service import get_config_dict, update_config

    before = [_rule("equal_or_above_class")]
    ids = _seed(app, levels=LADDER, eligibility_rules=before)
    with app.app_context():
        with pytest.raises(HTTPException) as err:
            update_config(ids["coach_id"], {"eligibilityRules": [_rule("made_up_operation", 1)]})
        assert err.value.code == 400
        assert "eligibilityRules" in (err.value.description or "")
        db.session.rollback()
        assert get_config_dict(ids["coach_id"])["eligibilityRules"] == before


@pytest.mark.criterion("ELIGIBILITY-RULES-8")
def test_saving_accepts_what_a_client_round_trips(app):
    """AC "… and accepts what a client round-trips": a released build that does not
    offer the directional operations posts the list back exactly as it received it."""
    from padel_app.services.notification_service import get_config_dict, update_config

    held = [
        _rule("within_n_above_class", 2),
        _rule("equal_or_above_class"),
        {"attribute": "unjustified_absences", "operation": "less_than", "value": 3},
    ]
    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        update_config(ids["coach_id"], {"eligibilityRules": held})
        assert get_config_dict(ids["coach_id"])["eligibilityRules"] == held
        # The round trip: the same list, unchanged, saved again.
        update_config(ids["coach_id"], {"eligibilityRules": get_config_dict(ids["coach_id"])["eligibilityRules"]})
        assert get_config_dict(ids["coach_id"])["eligibilityRules"] == held


@pytest.mark.criterion("ELIGIBILITY-RULES-8")
def test_edit_class_rejects_an_unknown_level_operation_and_accepts_the_new_ones(app):
    """AC "… the same holds for edit_class with updates.eligibilityRules"."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service

    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}

        result, status = edit_class_service(
            {"event": event, "scope": "single", "updates": {"eligibilityRules": [_rule("made_up_operation")]}})
        assert status == 400, result
        assert "eligibilityRules" in str(result)
        db.session.rollback()
        assert db.session.get(LessonInstance, inst.id).eligibility_rules is None

        below = [_rule("within_n_below_class", 1)]
        result, status = edit_class_service(
            {"event": event, "scope": "single", "updates": {"eligibilityRules": below}})
        assert status == 200, result
        assert db.session.get(LessonInstance, inst.id).eligibility_rules == below


@pytest.mark.parametrize("operation", ["within_n_above_class", "within_n_below_class", "made_up_operation"])
@pytest.mark.criterion("ELIGIBILITY-RULES-9")
def test_saving_invitation_groups_rejects_a_level_operation_outside_the_vacancy_five(app, operation):
    """Rule 6: an invitation group's level rule is anchored to the VACANCY — saving one
    with a class operation (or an unknown one) is refused, and nothing is stored."""
    from padel_app.services.notification_service import get_config_dict, update_config

    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        before = get_config_dict(ids["coach_id"])["invitationGroups"]
        groups = [{"name": "G", "rules": [{"attribute": "level", "operation": operation, "value": 1}]}]
        with pytest.raises(HTTPException) as err:
            update_config(ids["coach_id"], {"invitationGroups": groups})
        assert err.value.code == 400
        assert "invitationGroups" in (err.value.description or "")
        db.session.rollback()
        assert get_config_dict(ids["coach_id"])["invitationGroups"] == before


@pytest.mark.criterion("ELIGIBILITY-RULES-9")
def test_saving_invitation_groups_accepts_the_vacancy_five_and_other_attributes(app):
    """… and every vacancy operation, plus non-level rules, still save."""
    from padel_app.services.notification_service import get_config_dict, update_config

    groups = [
        {"name": op, "rules": [{"attribute": "level", "operation": op},
                               {"attribute": "side", "operation": "same_as_vacancy"}]}
        for op in ("same_as_vacancy", "one_above_vacancy", "one_below_vacancy",
                   "all_above_vacancy", "all_below_vacancy")
    ]
    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        update_config(ids["coach_id"], {"invitationGroups": groups})
        assert get_config_dict(ids["coach_id"])["invitationGroups"] == groups


# ---------------------------------------------------------------------------
# Rule 12 — an unknown attribute or operation, on any attribute
# ---------------------------------------------------------------------------

UNKNOWN_RULES = [
    ({"attribute": "language", "operation": "equals", "value": "en"}, "unknown_attribute"),
    ({"attribute": "unjustified_absences", "operation": "made_up", "value": 0}, "unknown_operation"),
    ({"attribute": "side", "operation": "made_up"}, "unknown_operation"),
    ({"attribute": "has_makeups", "operation": "made_up"}, "unknown_operation"),
    ({"attribute": "subscription_status", "operation": "made_up", "value": "active"}, "unknown_operation"),
]


@pytest.mark.parametrize("rule,reason", UNKNOWN_RULES)
@pytest.mark.criterion("ELIGIBILITY-RULES-17")
def test_an_unknown_attribute_or_operation_fails_everyone_and_says_so(app, rule, reason):
    """AC "An unknown attribute or operation fails everyone, and says so" (rule 12). Each used to
    match no branch and pass all eight students, as a bar (no vacancy) and as a group (a vacancy)."""
    from types import SimpleNamespace

    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import _group_rule_failures

    assert _passing_indexes(app, [rule]) == set()

    with app.app_context():
        instance = LessonInstance.query.first()
        vacancy = SimpleNamespace(level_id=None, side="right")     # the group path; its level is the class's
        for cp in Association_CoachPlayer.query.all():
            for target in (None, vacancy):
                (failure,) = _group_rule_failures([rule], cp, target, cp.coach_id, instance)
                assert (failure["attribute"], failure["operation"], failure["reason"]) == (
                    rule["attribute"], rule["operation"], reason)


@pytest.mark.parametrize("rule", [{"attribute": "side", "operation": "different_from_vacancy"},
                                  {"attribute": "unjustified_absences", "operation": "less_than"}])
@pytest.mark.criterion("ELIGIBILITY-RULES-17")
def test_the_other_side_and_a_count_rule_with_no_value_still_fail_nobody(app, rule):
    """… and `different_from_vacancy` (config rule 20, applied by the new engine only) and a count
    rule with no value (the editors' blank field, its own task) are unchanged: nobody fails them."""
    assert _passing_indexes(app, [rule]) == set(range(8))


@pytest.mark.parametrize("rule", [UNKNOWN_RULES[0][0], UNKNOWN_RULES[3][0]])
@pytest.mark.criterion("ELIGIBILITY-RULES-18")
def test_saving_refuses_an_unknown_attribute_or_operation_on_every_path(app, rule):
    """AC "Saving refuses an unknown attribute or operation on every path" (rule 12): the coach's
    bar and groups, edit_class and the class create, each in its own error shape, writing nothing."""
    from padel_app.model import NotNullableFieldError
    from padel_app.models import Lesson
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import add_class_service, edit_class_service
    from padel_app.services.notification_service import get_config_dict, update_config

    before = [_rule("equal_or_above_class")]
    ids = _seed(app, levels=LADDER, eligibility_rules=before)
    with app.app_context():
        groups_before = get_config_dict(ids["coach_id"])["invitationGroups"]
        for data, field in (({"eligibilityRules": [rule]}, "eligibilityRules"),
                            ({"invitationGroups": [{"name": "G", "rules": [rule]}]}, "invitationGroups")):
            with pytest.raises(HTTPException) as err:
                update_config(ids["coach_id"], data)
            assert err.value.code == 400
            assert field in (err.value.description or "")
            db.session.rollback()
        config = get_config_dict(ids["coach_id"])
        assert (config["eligibilityRules"], config["invitationGroups"]) == (before, groups_before)

        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
        result, status = edit_class_service(
            {"event": event, "scope": "single", "updates": {"eligibilityRules": [rule]}})
        assert (status, result) == (400, {"error": "invalid_fields", "fields": ["eligibilityRules"]})
        db.session.rollback()
        assert db.session.get(LessonInstance, inst.id).eligibility_rules is None

        lessons = Lesson.query.count()
        with pytest.raises(NotNullableFieldError) as refused:
            add_class_service(
                {"name": "New", "maxPlayers": 4, "startTime": "2030-01-07T10:00", "endTime": "2030-01-07T11:00",
                 "eligibilityRules": [rule]},
                db.session.get(Coach, ids["coach_id"]), Club.query.first())
        assert "eligibilityRules" in refused.value.fields
        db.session.rollback()
        assert Lesson.query.count() == lessons


@pytest.mark.criterion("ELIGIBILITY-RULES-18")
def test_saving_accepts_every_rule_the_editors_offer(app):
    """… and every attribute and operation the web and iOS editors offer still saves, the other side
    included for a new-engine coach (config rule 20)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import get_config_dict, update_config

    offered = [
        {"attribute": "side", "operation": "same_as_vacancy"},
        {"attribute": "side", "operation": "different_from_vacancy"},
        {"attribute": "has_makeups", "operation": "is_true"},
        *({"attribute": a, "operation": op, "value": 2}
          for a in ("unjustified_absences", "justified_absences")
          for op in ("less_than", "equals", "less_than_or_equal")),
        {"attribute": "attendance_rate", "operation": "greater_than", "value": 80},
        {"attribute": "attendance_rate", "operation": "greater_than_or_equal", "value": 80},
        {"attribute": "subscription_status", "operation": "equals", "value": "active"},
        {"attribute": "level", "operation": "same_as_vacancy"},
    ]
    groups = [{"name": f"G{i}", "rules": [rule]} for i, rule in enumerate(offered)]
    bar = [{"attribute": a, "operation": op, "value": 2}
           for a in ("unjustified_absences", "justified_absences") for op in ("less_than", "less_than_or_equal")]
    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one().engine_version = "new"
        db.session.commit()
        update_config(ids["coach_id"], {"invitationGroups": groups, "eligibilityRules": bar})
        config = get_config_dict(ids["coach_id"])
        assert (config["invitationGroups"], config["eligibilityRules"]) == (groups, bar)
