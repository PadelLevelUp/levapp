"""PAD-770 — semi-automatic suggestions follow the class (semi-auto-approval rules 5, 12b).

Prod, 2026-10-27 20:41: a student whose request to join was accepted, and a student who had
declined, were still in the class's suggested queue, and its spot count was one too high. The
class view now computes the queue when shown (PAD-765), and a "yes" re-checks every student when it
sends. These pin the three cases the ticket names. Students are cases 7-13.
"""
from padel_app.sql_db import db
from padel_app.tests.test_semi_auto_approval import _create_pending_prompt, _patched_io, _seed_world


def _shown(world):
    from padel_app.services.replacement_approval_service import instance_suggestions

    state = instance_suggestions(world["instance"].id, world["coach"].id)
    return {v["vacancyId"]: [int(e["id"]) for e in v["queue"]]
            for b in state.get("bundles", []) for v in b["vacancies"]}


def _class_with_a_decline_and_a_join(prefix):
    """Two pending spots (cases 7 and 8 declined). The coach approves case 7's spot; one invitee
    (case 10) answers no; then case 13, still only suggested, asks to join and is accepted."""
    from padel_app.models import NotificationEvent, Player
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.services.replacement_approval_service import respond_to_approval

    world = _seed_world(prefix, n_candidates=5, enrolled=3, max_players=5)
    (_, case7), (_, case8), _ = world["enrolled"]
    first = _create_pending_prompt(world, case7)
    second = _create_pending_prompt(world, case8)
    with _patched_io():
        respond_to_approval(first[2]["bundleId"], "yes_now", world["coach"].id)
    db.session.commit()
    invited = NotificationEvent.query.filter_by(vacancy_id=first[0].id).order_by(NotificationEvent.id).all()
    decliner = invited[0].player_id
    with _patched_io():
        respond_to_notification(invited[0].id, "no", db.session.get(Player, decliner).user_id)
    asked = {e.player_id for e in NotificationEvent.query.filter_by(lesson_instance_id=world["instance"].id)}
    joiner = next(pid for pid in _shown(world)[second[0].id] if pid not in asked)
    row = ClassJoinRequest(lesson_instance_id=world["instance"].id, player_id=joiner,
                           coach_id=world["coach"].id, status="pending")
    db.session.add(row)
    db.session.commit()
    with _patched_io():
        decide_join_request_service(row.id, world["coach"], accept=True, confirm=True)
    db.session.commit()
    return world, first, second, decliner, joiner


def test_a_student_who_joined_leaves_the_queue_and_the_spots_drop_by_one(app):
    from padel_app.models.vacancy import Vacancy

    with app.app_context():
        world, first, second, _decliner, joiner = _class_with_a_decline_and_a_join("q770a")
        # Case 13's join took one of the two spots: one is left open.
        open_spots = Vacancy.query.filter_by(lesson_instance_id=world["instance"].id, status="open").count()
        assert open_spots == 1
        assert all(joiner not in queue for queue in _shown(world).values())


def test_a_student_who_declined_is_not_suggested_again(app):
    with app.app_context():
        world, _first, _second, decliner, _joiner = _class_with_a_decline_and_a_join("q770b")
        assert all(decliner not in queue for queue in _shown(world).values())


def test_approving_an_old_list_invites_neither_and_no_more_spots_than_open(app):
    from padel_app.models import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.replacement_approval_service import respond_to_approval

    with app.app_context():
        world, first, second, decliner, joiner = _class_with_a_decline_and_a_join("q770c")
        open_ids = {v.id for v in Vacancy.query.filter_by(lesson_instance_id=world["instance"].id,
                                                          status="open")}
        old_ids = {v["vacancyId"] for v in second[2]["vacancies"]}
        with _patched_io():
            result = respond_to_approval(second[2]["bundleId"], "yes_now", world["coach"].id)
        db.session.commit()
        live = NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == world["instance"].id,
            NotificationEvent.status.in_(("sent", "queued")),
        ).all()
        assert decliner not in {e.player_id for e in live}
        assert joiner not in {e.player_id for e in live}
        # Only open spots send; a spot of the old list that closed answers "stale".
        assert {e.vacancy_id for e in live} <= open_ids
        sent = {r["vacancyId"] for r in result["vacancies"] if r["result"] == "approved_now"}
        assert sent <= open_ids and sent <= old_ids
