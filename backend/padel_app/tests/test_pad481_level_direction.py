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
