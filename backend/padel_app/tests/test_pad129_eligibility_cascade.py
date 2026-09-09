"""PAD-129 — eligibility.cascade: per-series and per-class overrides.

Rules 1–6 and 8 of `.specflow/specs/eligibility/cascade.spec.md`. Reuses the
Phase-1 seed (`test_pad128_eligibility._seed`): a `4 → 5 → 5-` ladder, a class
at level `5`, and a coach standard bar passed in.
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _cp, _seed

LEVEL_SAME = [{"attribute": "level", "operation": "same_as_class"}]
LEVEL_WITHIN_1 = [{"attribute": "level", "operation": "within_n_of_class", "value": 1}]
LEVEL_AT_OR_ABOVE = [{"attribute": "level", "operation": "equal_or_above_class"}]
ABSENCES_2 = [{"attribute": "unjustified_absences", "operation": "less_than_or_equal", "value": 2}]


def _set_tiers(app, ids, *, lesson=None, instance=None, touch_lesson=False, touch_instance=False):
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        if touch_lesson:
            db.session.get(Lesson, ids["lesson_id"]).eligibility_rules = lesson
        if touch_instance:
            db.session.get(LessonInstance, ids["instance_id"]).eligibility_rules = instance
        db.session.commit()


def _resolve(app, ids):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_eligibility_with_source,
    )

    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        rules, source = effective_eligibility_with_source(inst, ids["coach_id"])
        assert effective_eligibility(inst, ids["coach_id"]) == rules, "one resolver, one answer"
        return rules, source


def test_most_specific_tier_wins_outright(app):
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _set_tiers(app, ids, lesson=LEVEL_WITHIN_1, instance=LEVEL_AT_OR_ABOVE,
               touch_lesson=True, touch_instance=True)
    rules, source = _resolve(app, ids)
    assert (rules, source) == (LEVEL_AT_OR_ABOVE, "instance")


def test_tiers_do_not_merge(app):
    """Lesson override replaces the coach bar: 5 absences at the right level is eligible."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import effective_eligibility, passes_eligibility

    ids = _seed(app, eligibility_rules=ABSENCES_2)
    _set_tiers(app, ids, lesson=LEVEL_SAME, touch_lesson=True)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "absentee", level_id=ids["level_ids"]["5"])
        # Five unjustified absences on past classes with this coach.
        inst = db.session.get(LessonInstance, ids["instance_id"])
        for i in range(5):
            past = LessonInstance(
                lesson_id=inst.lesson_id, start_datetime=datetime.utcnow() - timedelta(days=i + 1),
                end_datetime=datetime.utcnow() - timedelta(days=i + 1) + timedelta(hours=1),
                max_players=4, status="scheduled", level_id=inst.level_id,
            )
            db.session.add(past)
            db.session.flush()
            db.session.add(Presence(lesson_instance_id=past.id, player_id=pid, status="absent",
                                    justification="unjustified", validated=True))
        db.session.commit()
        rules = effective_eligibility(inst, ids["coach_id"])
        assert rules == LEVEL_SAME
        assert passes_eligibility(_cp(ids["coach_id"], pid), inst, ids["coach_id"], rules) is True


def test_empty_override_opens_one_class_inside_a_restricted_series(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import effective_eligibility, passes_eligibility

    ids = _seed(app, eligibility_rules=None)
    _set_tiers(app, ids, lesson=LEVEL_SAME, touch_lesson=True)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        # A sibling occurrence of the same series, no override.
        sibling = LessonInstance(
            lesson_id=inst.lesson_id, start_datetime=inst.start_datetime + timedelta(days=7),
            end_datetime=inst.end_datetime + timedelta(days=7), max_players=4,
            status="scheduled", level_id=inst.level_id,
        )
        db.session.add(sibling)
        inst.eligibility_rules = []
        db.session.commit()
        weak = _add_student(ids["coach_id"], "weak", level_id=ids["level_ids"]["5-"])
        cp = _cp(ids["coach_id"], weak)

        opened = effective_eligibility(inst, ids["coach_id"])
        assert opened == [] and passes_eligibility(cp, inst, ids["coach_id"], opened) is True
        still = effective_eligibility(sibling, ids["coach_id"])
        assert still == LEVEL_SAME and passes_eligibility(cp, sibling, ids["coach_id"], still) is False


def test_virtual_occurrence_resolves_at_the_lesson_tier_without_materialising(app):
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import effective_eligibility_with_source

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _set_tiers(app, ids, lesson=LEVEL_WITHIN_1, touch_lesson=True)
    with app.app_context():
        before = LessonInstance.query.count()
        lesson = db.session.get(Lesson, ids["lesson_id"])
        rules, source = effective_eligibility_with_source(lesson, ids["coach_id"])
        assert (rules, source) == (LEVEL_WITHIN_1, "lesson")
        assert LessonInstance.query.count() == before, "resolution must not materialise"


def test_null_tiers_fall_through_to_the_coach_bar(app):
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    rules, source = _resolve(app, ids)
    assert (rules, source) == (LEVEL_SAME, "coach")


def test_edit_scope_single_writes_the_instance_tier_and_null_clears_it(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        event = {"model": "LessonInstance", "originalId": inst.id, "date": inst.start_datetime.date().isoformat()}
        result, status = edit_class_service({"event": event, "scope": "single", "updates": {"eligibilityRules": []}})
        assert status == 200
        assert db.session.get(LessonInstance, inst.id).eligibility_rules == []
        # Untouched payloads leave the tier alone …
        edit_class_service({"event": event, "scope": "single", "updates": {"name": "Renamed"}})
        assert db.session.get(LessonInstance, inst.id).eligibility_rules == []
        # … and null clears it back to the tier below.
        edit_class_service({"event": event, "scope": "single", "updates": {"eligibilityRules": None}})
        assert db.session.get(LessonInstance, inst.id).eligibility_rules is None


def test_edit_scope_future_forks_the_series_from_that_date(app):
    """Rule 6: a mid-series future edit forks; earlier occurrences keep the old bar."""
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service
    from padel_app.services.notification_service import effective_eligibility_with_source

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        lesson.is_recurring = True
        lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((lesson.start_datetime.weekday() + 1) % 7)
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=8)).date()
        lesson.eligibility_rules = LEVEL_WITHIN_1
        first = db.session.get(LessonInstance, ids["instance_id"])
        later = LessonInstance(
            lesson_id=lesson.id, start_datetime=first.start_datetime + timedelta(weeks=2),
            end_datetime=first.end_datetime + timedelta(weeks=2), max_players=4,
            status="scheduled", level_id=first.level_id,
            original_lesson_occurence_date=(first.start_datetime + timedelta(weeks=2)).date(),
        )
        db.session.add(later)
        db.session.commit()
        event = {"model": "LessonInstance", "originalId": later.id, "date": later.start_datetime.date().isoformat()}
        result, status = edit_class_service({"event": event, "scope": "future", "updates": {"eligibilityRules": LEVEL_AT_OR_ABOVE}})
        assert status == 201
        forked = db.session.get(Lesson, result["id"])
        assert forked.id != lesson.id and forked.eligibility_rules == LEVEL_AT_OR_ABOVE
        # The earlier occurrence stays on the old master with the old bar …
        assert effective_eligibility_with_source(db.session.get(LessonInstance, first.id), ids["coach_id"]) == (LEVEL_WITHIN_1, "lesson")
        # … and the edited occurrence now reads the forked master's bar.
        assert effective_eligibility_with_source(db.session.get(LessonInstance, later.id), ids["coach_id"]) == (LEVEL_AT_OR_ABOVE, "lesson")


def test_class_payload_carries_tier_and_provenance(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        data = serialize_class_instance(inst)
        assert data["eligibilityRules"] is None
        assert (data["effectiveEligibilityRules"], data["eligibilitySource"]) == (LEVEL_SAME, "coach")
        inst.eligibility_rules = []
        db.session.commit()
        data = serialize_class_instance(db.session.get(LessonInstance, inst.id))
        assert (data["eligibilityRules"], data["effectiveEligibilityRules"], data["eligibilitySource"]) == ([], [], "instance")
