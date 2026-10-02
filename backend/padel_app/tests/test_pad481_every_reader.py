"""PAD-481 / eligibility.rules rule 7 (one evaluator): every reader of the bar
honours the one-way level operation `within_n_above_class`.

The bar is `[{level, within_n_above_class, 1}]`, the class sits at the middle
level `5` of the ladder `4 -> 5 -> 5-` (strongest first). So `4` (one step
stronger) is admitted and `5-` (one step weaker) is not. The weaker student is
the discriminating one: the old both-ways `within_n_of_class` would admit them,
so a reader with its own copy of the logic, or one that treats the new
operation as "both" or as unknown -> pass, goes red.

One test per reader, each entering through the reader itself rather than
through `passes_eligibility`.
"""
import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed

BAR = [{"attribute": "level", "operation": "within_n_above_class", "value": 1}]


def _config(ids, **fields):
    from padel_app.models.notification_config import NotificationConfig

    cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
    for k, v in fields.items():
        setattr(cfg, k, v)
    db.session.commit()
    return cfg


def _pair(ids):
    """(stronger, weaker) students: ladder `4` and `5-` against a class at `5`."""
    strong = _add_student(ids["coach_id"], "strong", ids["level_ids"]["4"])
    weak = _add_student(ids["coach_id"], "weak", ids["level_ids"]["5-"])
    db.session.commit()
    return strong, weak


def _enrol(player_id, instance_id):
    from padel_app.models.presences import Presence

    db.session.add(Presence(
        player_id=player_id, lesson_instance_id=instance_id,
        invited=True, enrolment_source="coach"))
    db.session.flush()


def _player(pid):
    from padel_app.models.players import Player

    return db.session.get(Player, pid)


def _instance(ids):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, ids["instance_id"])


def _refusal_code(exc_info):
    return exc_info.value.response.get_json()["code"]


def test_invitation_recipients_group_admits_stronger_not_weaker(app):
    """Reader: invitation recipients, `_get_eligible_students_for_group`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _get_eligible_students_for_group

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        strong, weak = _pair(ids)
        instance = _instance(ids)
        db.session.add(Vacancy(
            lesson_instance_id=instance.id, coach_id=ids["coach_id"],
            status="open", level_id=ids["level_ids"]["5"]))
        db.session.commit()
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).first()

        # Group 3 = the widest ("Open to all"): only the bar limits it.
        invited = {cp.player_id for cp in _get_eligible_students_for_group(
            vacancy, instance, ids["coach_id"], config, 3)}
        assert strong in invited
        assert weak not in invited


def test_invitation_recipients_evaluate_candidates_tags_weaker_ineligible(app):
    """Reader: invitation recipients, `evaluate_candidates` (the explain path).
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import evaluate_candidates

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        strong, weak = _pair(ids)
        instance = _instance(ids)
        db.session.add(Vacancy(
            lesson_instance_id=instance.id, coach_id=ids["coach_id"],
            status="open", level_id=ids["level_ids"]["5"]))
        db.session.commit()
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).first()

        verdicts = {
            v.cp.player_id: v for v in evaluate_candidates(
                vacancy, instance, ids["coach_id"], config,
                wave=("group", 3), explain=True, only_player_ids=[strong, weak])
        }
        assert verdicts[strong].stage == "invited"
        assert verdicts[weak].stage == "eligibility"


def test_waiting_list_fill_places_stronger_not_weaker(app):
    """Reader: waiting-list fill, `_check_waiting_list`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import _check_waiting_list

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        strong, weak = _pair(ids)
        instance = _instance(ids)
        db.session.add(WaitingListEntry(
            lesson_instance_id=instance.id, player_id=weak,
            coach_id=ids["coach_id"], is_active=True))
        db.session.add(Vacancy(
            lesson_instance_id=instance.id, coach_id=ids["coach_id"],
            status="open", level_id=ids["level_ids"]["5"]))
        db.session.commit()
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).first()

        # (b) only the weaker student is waiting: nobody is placed.
        assert _check_waiting_list(vacancy, instance, ids["coach_id"], config, 1) is None

        # (a) the stronger student joins the list and is the one placed.
        db.session.add(WaitingListEntry(
            lesson_instance_id=instance.id, player_id=strong,
            coach_id=ids["coach_id"], is_active=True))
        db.session.commit()
        picked = _check_waiting_list(vacancy, instance, ids["coach_id"], config, 1)
        assert picked is not None and picked.player_id == strong


def test_open_spot_calendar_shows_stronger_not_weaker(app):
    """Reader: open-spot visibility on the calendar, `load_open_spot_events_for_player`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from datetime import timedelta

    from padel_app.helpers.calendar_helpers import load_open_spot_events_for_player
    from padel_app.utils.dates import utcnow_naive

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        _config(ids, open_spots_visible=True)
        strong, weak = _pair(ids)
        now = utcnow_naive()
        start, end = now - timedelta(days=1), now + timedelta(days=30)

        assert len(load_open_spot_events_for_player(strong, start, end)) == 1
        assert load_open_spot_events_for_player(weak, start, end) == []


def test_single_class_open_spot_view_allows_stronger_not_weaker(app):
    """Reader: open-spot visibility for one class, `student_may_view_open_spot`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.class_join_request_service import student_may_view_open_spot

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        _config(ids, open_spots_visible=True)
        strong, weak = _pair(ids)
        instance = _instance(ids)

        assert student_may_view_open_spot(_player(strong), instance) is True
        assert student_may_view_open_spot(_player(weak), instance) is False


def test_join_request_creation_admits_stronger_refuses_weaker(app):
    """Reader: join request creation, `create_join_request_service`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.class_join_request_service import create_join_request_service

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        _config(ids, open_spots_visible=True)
        strong, weak = _pair(ids)

        row, created = create_join_request_service(
            _player(strong), "LessonInstance", ids["instance_id"], None)
        assert created is True and row.status == "pending"

        with pytest.raises(HTTPException) as e:
            create_join_request_service(
                _player(weak), "LessonInstance", ids["instance_id"], None)
        assert _refusal_code(e) == "ineligible"


def test_join_request_accept_flags_weaker_not_stronger(app):
    """Reader: join request accept, `decide_join_request_service` (the `confirm` flag).
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.models import Coach
    from padel_app.services.class_join_request_service import (
        create_join_request_service,
        decide_join_request_service,
    )

    # Requests are filed while the bar is unset, then the bar tightens, so the
    # accept path's own re-check is what decides.
    ids = _seed(app, eligibility_rules=None)
    with app.app_context():
        _config(ids, open_spots_visible=True)
        strong, weak = _pair(ids)
        strong_req, _ = create_join_request_service(
            _player(strong), "LessonInstance", ids["instance_id"], None)
        weak_req, _ = create_join_request_service(
            _player(weak), "LessonInstance", ids["instance_id"], None)
        strong_req_id, weak_req_id = strong_req.id, weak_req.id
        _config(ids, eligibility_rules=BAR)
        coach = db.session.get(Coach, ids["coach_id"])

        with pytest.raises(HTTPException) as e:
            decide_join_request_service(weak_req_id, coach, accept=True)
        body = e.value.response.get_json()
        assert body["code"] == "ineligible"
        assert [i["playerId"] for i in body["ineligible"]] == [weak]

        row = decide_join_request_service(strong_req_id, coach, accept=True)
        assert row.status == "accepted"


def test_class_waiting_list_join_admits_stronger_refuses_weaker(app):
    """Reader: joining a class waiting list, `join_class_waiting_list_service`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.academy_class_service import join_class_waiting_list_service

    ids = _seed(app, eligibility_rules=BAR, max_players=1)
    with app.app_context():
        _config(ids, open_spots_visible=True)
        strong, weak = _pair(ids)
        filler = _add_student(ids["coach_id"], "filler", ids["level_ids"]["5"])
        _enrol(filler, ids["instance_id"])  # the class is now full
        db.session.commit()

        entry, created = join_class_waiting_list_service(
            _player(strong), "LessonInstance", ids["instance_id"], None)
        assert created is True and entry.is_active

        with pytest.raises(HTTPException) as e:
            join_class_waiting_list_service(
                _player(weak), "LessonInstance", ids["instance_id"], None)
        assert _refusal_code(e) == "ineligible"


def test_class_edit_warning_names_weaker_not_stronger(app):
    """Reader: the class-edit warning, `eligibility_failures_for_players`
    (backs POST /api/app/notify/eligibility_check).
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.notification_service import eligibility_failures_for_players

    ids = _seed(app, eligibility_rules=BAR)
    with app.app_context():
        strong, weak = _pair(ids)
        out = eligibility_failures_for_players(
            _instance(ids), ids["coach_id"], [strong, weak])
        assert [o["playerId"] for o in out] == [weak]
        assert out[0]["failures"]


def test_config_save_scan_names_enrolled_weaker_not_stronger(app):
    """Reader: the config-save impact scan, `students_failing_eligibility_bar`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.notification_service import students_failing_eligibility_bar

    ids = _seed(app, eligibility_rules=None, max_players=4)
    with app.app_context():
        strong, weak = _pair(ids)
        _enrol(strong, ids["instance_id"])
        _enrol(weak, ids["instance_id"])
        db.session.commit()

        affected = students_failing_eligibility_bar(ids["coach_id"], BAR)
        assert [a["playerId"] for a in affected] == [weak]


def test_invite_simulation_explain_invites_stronger_flags_weaker(app):
    """Reader: invite simulation (explain mode), `explain_player`.
    PAD-481 / eligibility.rules rule 7 (one evaluator)."""
    from padel_app.services.invite_simulation_service import explain_player

    ids = _seed(app, eligibility_rules=BAR, max_players=1)
    with app.app_context():
        strong, weak = _pair(ids)
        alice = _add_student(ids["coach_id"], "alice", ids["level_ids"]["5"], "left")
        _enrol(alice, ids["instance_id"])
        db.session.commit()
        instance = _instance(ids)

        assert explain_player(instance, ids["coach_id"], alice, strong)["stage"] == "invited"
        verdict = explain_player(instance, ids["coach_id"], alice, weak)
        assert verdict["stage"] == "eligibility"
        assert verdict["details"]["failures"][0]["operation"] == "within_n_above_class"
