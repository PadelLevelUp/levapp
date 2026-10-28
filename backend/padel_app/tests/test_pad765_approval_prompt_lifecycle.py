"""PAD-765 — semi-automatic approval prompts on the class (semi-auto-approval rules 11, 12).

Prod, 2026-10-27: one class had two pending prompts from two declines a week apart. The class
sheet showed only the newest (rule 12 said "the newest pending bundle"), so the older spot was
invisible there for six days. The older spot was then filled by an accepted join request, and its
prompt stayed `pending` with the Assistant message still asking (rule 11 only applied at decision
time). Students are cases 7-13.
"""
from datetime import datetime

from padel_app.sql_db import db
from padel_app.tests.test_semi_auto_approval import (
    _create_pending_prompt,
    _patched_io,
    _seed_world,
)


def _two_declines(prefix, **world_kw):
    world = _seed_world(prefix, n_candidates=2, enrolled=3, **world_kw)
    (_, case7), (_, case8) = world["enrolled"][0], world["enrolled"][1]
    first = _create_pending_prompt(world, case7)   # the older decline, its own bundle
    second = _create_pending_prompt(world, case8)  # a later decline, a second bundle
    assert first[2]["bundleId"] != second[2]["bundleId"]
    return world, first, second


def test_the_class_shows_every_pending_prompt_in_decline_order(app):
    from padel_app.services.replacement_approval_service import instance_suggestions

    with app.app_context():
        world, (v1, _p1, b1), (v2, _p2, b2) = _two_declines("pl1")
        state = instance_suggestions(world["instance"].id, world["coach"].id)
        assert state["state"] == "pending"
        bundles = state["bundles"]
        assert [b["bundleId"] for b in bundles] == [b1["bundleId"], b2["bundleId"]]
        assert [[v["vacancyId"] for v in b["vacancies"]] for b in bundles] == [[v1.id], [v2.id]]
        # Builds that read one bundle get the oldest decline, not the newest.
        assert state["bundle"]["bundleId"] == b1["bundleId"]


def test_the_class_shows_the_queue_as_it_is_now(app):
    """Rule 12 (PAD-765): the queue is computed when shown; a student enrolled since the prompt was
    built is not offered as a candidate."""
    from padel_app.services.lesson_service import enrol
    from padel_app.services.replacement_approval_service import instance_suggestions

    with app.app_context():
        world = _seed_world("pl2", n_candidates=2, enrolled=1, max_players=4)
        _, case7 = world["enrolled"][0]
        _v, _p, built = _create_pending_prompt(world, case7)
        snapshot = [str(e["id"]) for e in built["vacancies"][0]["queue"]]
        _, case9 = world["candidates"][0]
        assert str(case9.id) in snapshot
        with _patched_io():
            enrol(case9.id, world["instance"], "coach")
        db.session.commit()
        shown = instance_suggestions(world["instance"].id, world["coach"].id)["bundles"][0]
        assert str(case9.id) not in [str(e["id"]) for e in shown["vacancies"][0]["queue"]]


def _message_for(prompt):
    from padel_app.models import Message
    return db.session.get(Message, prompt.message_id)


def test_a_spot_filled_another_way_resolves_its_prompt_and_message(app):
    """Rule 11 (PAD-765): filling the spot through `_close_vacancy` (every fill route's one closer)
    marks the pending prompt stale at once and the Assistant message says that spot is taken."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.services.notification_service import _close_vacancy
    from padel_app.services.replacement_approval_service import instance_suggestions

    with app.app_context():
        world, (v1, p1, b1), (v2, _p2, b2) = _two_declines("pl3")
        _, case10 = world["candidates"][0]
        with _patched_io():
            _close_vacancy(v1, case10.id)
            db.session.commit()
        prompt = db.session.get(ReplacementApprovalPrompt, p1.id)
        assert prompt.status == "stale"
        meta = _message_for(prompt).msg_metadata
        assert [v.get("resolved") for v in meta["vacancies"]] == ["filled"]
        assert meta["responded"] is False, "not answered: the clients read `resolved` as stale"
        state = instance_suggestions(world["instance"].id, world["coach"].id)
        assert [b["bundleId"] for b in state["bundles"]] == [b2["bundleId"]]


def test_a_coach_add_that_fills_the_class_resolves_the_prompt(app):
    """The route the sheet uses: the coach adds a student, the class is full, the spot closes."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        world = _seed_world("pl4", n_candidates=1, enrolled=2, max_players=2)
        _, case7 = world["enrolled"][0]
        vacancy, prompt, _bundle = _create_pending_prompt(world, case7)
        _, case11 = world["candidates"][0]
        with _patched_io():
            enrol(case11.id, world["instance"], "coach")
        db.session.commit()
        assert db.session.get(Vacancy, vacancy.id).status == "filled"
        assert db.session.get(ReplacementApprovalPrompt, prompt.id).status == "stale"


def test_a_spot_that_expires_resolves_its_prompt(app):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.services.replacement_approval_service import resolve_prompts_for

    with app.app_context():
        world = _seed_world("pl5", n_candidates=1, enrolled=2)
        _, case12 = world["enrolled"][0]
        vacancy, prompt, _bundle = _create_pending_prompt(world, case12)
        vacancy.status = "expired"
        resolve_prompts_for(vacancy)
        db.session.commit()
        assert db.session.get(ReplacementApprovalPrompt, prompt.id).status == "stale"
        assert _message_for(prompt).msg_metadata["vacancies"][0]["resolved"] == "expired"


def test_one_spot_of_a_two_spot_bundle_filling_keeps_the_other_asking(app):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _close_vacancy, _ensure_vacancy_for_player
    from padel_app.services.replacement_approval_service import create_approval_prompts, instance_suggestions
    from padel_app.tests.test_semi_auto_approval import _mark_absent

    with app.app_context():
        world = _seed_world("pl6", n_candidates=2, enrolled=3)
        inst, coach = world["instance"], world["coach"]
        vacs = []
        for _, case in world["enrolled"][:2]:  # cases 7 and 8 decline together
            _mark_absent(inst, case)
            vacs.append(_ensure_vacancy_for_player(inst, coach.id, case.id))
        with _patched_io():
            bundle = create_approval_prompts(vacs, inst, coach.id, world["config"])
            _, case13 = world["candidates"][0]
            _close_vacancy(vacs[0], case13.id)
            db.session.commit()
        state = instance_suggestions(inst.id, coach.id)
        assert [b["bundleId"] for b in state["bundles"]] == [bundle["bundleId"]]
        assert [v["vacancyId"] for v in state["bundles"][0]["vacancies"]] == [vacs[1].id]
        assert db.session.get(Vacancy, vacs[1].id).approval_status == "pending"


def test_an_accepted_join_request_resolves_the_prompt_of_the_spot_it_fills(app):
    """The prod shape: the older spot's prompt waits; the coach accepts a student's request to join;
    the spot fills and its prompt is resolved, its message says so, and the class lists the rest."""
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.replacement_approval_service import instance_suggestions

    with app.app_context():
        world, (v1, p1, _b1), (v2, _p2, b2) = _two_declines("pl7")
        _, case9 = world["candidates"][0]
        row = ClassJoinRequest(lesson_instance_id=world["instance"].id, player_id=case9.id,
                               coach_id=world["coach"].id, status="pending")
        db.session.add(row)
        db.session.commit()
        with _patched_io():
            decide_join_request_service(row.id, world["coach"], accept=True, confirm=True)
        db.session.commit()
        filled = [v for v in (db.session.get(Vacancy, v1.id), db.session.get(Vacancy, v2.id))
                  if v.status == "filled"]
        assert len(filled) == 1
        prompt = ReplacementApprovalPrompt.query.filter_by(vacancy_id=filled[0].id).one()
        assert prompt.status == "stale"
        assert _message_for(prompt).msg_metadata["vacancies"][0]["resolved"] == "filled"
        left = [v for b in instance_suggestions(world["instance"].id, world["coach"].id)["bundles"]
                for v in b["vacancies"]]
        assert [v["vacancyId"] for v in left] == [v.id for v in (v1, v2) if v.id != filled[0].id]
