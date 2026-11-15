"""eligibility.rules rule 14 (engine stream, blank rules wave 3): the server refuses a rule that needs a
value and has none, through rule 12's one validator, on every save path and in each path's existing 400
shape (the shapes released iOS builds already show as their generic failure). Evaluation is unchanged:
ELIGIBILITY-RULES-17's `test_the_other_side_and_a_count_rule_with_no_value_still_fail_nobody` pins it."""
import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _seed

LADDER = ("a", "b", "c", "5", "d", "e", "f", "g")

BLANK_BAR_RULES = [
    {"attribute": "attendance_rate", "operation": "greater_than"},
    {"attribute": "level", "operation": "within_n_of_class"},
    {"attribute": "unjustified_absences", "operation": "less_than", "value": ""},
    {"attribute": "justified_absences", "operation": "equals", "value": "abc"},
]
BLANK_GROUP_RULES = [
    {"attribute": "subscription_status", "operation": "equals"},
    {"attribute": "justified_absences", "operation": "less_than", "value": None},
    {"attribute": "subscription_status", "operation": "equals", "value": "  "},
]


@pytest.mark.parametrize("bar_rule,group_rule", list(zip(BLANK_BAR_RULES, BLANK_GROUP_RULES + BLANK_GROUP_RULES[:1])))
@pytest.mark.criterion("ELIGIBILITY-RULES-22")
def test_saving_refuses_a_rule_with_no_value_on_every_path(app, bar_rule, group_rule):
    """AC "The server refuses a rule with no value on every save path" (rule 14): the coach's bar and
    groups (400 naming the field), edit_class (invalid_fields) and the class create (refused fields),
    each writing nothing."""
    from padel_app.model import NotNullableFieldError
    from padel_app.models import Lesson
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import add_class_service, edit_class_service
    from padel_app.services.notification_service import get_config_dict, update_config

    before = [{"attribute": "level", "operation": "equal_or_above_class"}]
    ids = _seed(app, levels=LADDER, eligibility_rules=before)
    with app.app_context():
        groups_before = get_config_dict(ids["coach_id"])["invitationGroups"]
        for data, field in (({"eligibilityRules": [bar_rule]}, "eligibilityRules"),
                            ({"invitationGroups": [{"name": "G", "rules": [group_rule]}]}, "invitationGroups")):
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
            {"event": event, "scope": "single", "updates": {"eligibilityRules": [bar_rule]}})
        assert (status, result) == (400, {"error": "invalid_fields", "fields": ["eligibilityRules"]})
        db.session.rollback()
        assert db.session.get(LessonInstance, inst.id).eligibility_rules is None

        lessons = Lesson.query.count()
        with pytest.raises(NotNullableFieldError) as refused:
            add_class_service(
                {"name": "New", "maxPlayers": 4, "startTime": "2030-01-07T10:00", "endTime": "2030-01-07T11:00",
                 "eligibilityRules": [bar_rule]},
                db.session.get(Coach, ids["coach_id"]), Club.query.first())
        assert "eligibilityRules" in refused.value.fields
        db.session.rollback()
        assert Lesson.query.count() == lessons


@pytest.mark.criterion("ELIGIBILITY-RULES-22")
def test_saving_accepts_zero_and_numeric_text(app):
    """… and the same rules with 0, "2" (and "active" for account status) save as sent, as do a bar of
    null or [] on the coach and on a class."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service
    from padel_app.services.notification_service import get_config_dict, update_config

    bar = [
        {"attribute": "attendance_rate", "operation": "greater_than", "value": 0},
        {"attribute": "level", "operation": "within_n_of_class", "value": "2"},
        {"attribute": "unjustified_absences", "operation": "less_than", "value": "0"},
    ]
    groups = [{"name": "G", "rules": [
        {"attribute": "subscription_status", "operation": "equals", "value": "active"},
        {"attribute": "justified_absences", "operation": "less_than", "value": 0},
    ]}]
    ids = _seed(app, levels=LADDER, eligibility_rules=None)
    with app.app_context():
        update_config(ids["coach_id"], {"eligibilityRules": bar, "invitationGroups": groups})
        config = get_config_dict(ids["coach_id"])
        assert (config["eligibilityRules"], config["invitationGroups"]) == (bar, groups)
        for cleared in (None, []):
            update_config(ids["coach_id"], {"eligibilityRules": cleared})
            assert get_config_dict(ids["coach_id"])["eligibilityRules"] == cleared

        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
        for sent in (bar, [], None):
            result, status = edit_class_service({"event": event, "scope": "single", "updates": {"eligibilityRules": sent}})
            assert status == 200, result
