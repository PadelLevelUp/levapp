"""PAD-780 — the invitation tick resolves prompts the listener never saw (semi-auto-approval rule 11).

Prod, 2026-10-28: after PAD-765 shipped, prompts stayed `pending` on spots that had closed before
its `before_flush` listener existed (a join request, an accepted request, a class edit). Nothing
resolved them but the coach's own tap. The tick now does, through the same `resolve_prompts_for`.
Rows are closed here with a bulk UPDATE, which no session flush sees, so the listener never fires.
Students are cases 7-13.
"""
from datetime import datetime

from padel_app.sql_db import db
from padel_app.tests.test_semi_auto_approval import (
    _create_pending_prompt,
    _patched_io,
    _seed_world,
)

NOW = datetime(2026, 10, 28, 9, 0)


def _declines(prefix, n):
    world = _seed_world(prefix, n_candidates=1, enrolled=n, max_players=n + 1)
    return world, [_create_pending_prompt(world, player) for _, player in world["enrolled"][:n]]


def _close_behind_the_listener(vacancy, status):
    from padel_app.models.vacancy import Vacancy

    Vacancy.query.filter_by(id=vacancy.id).update({"status": status}, synchronize_session=False)
    db.session.commit()
    db.session.expire_all()


def _tick():
    from padel_app.services.notification_service import process_invitation_batches

    with _patched_io():
        process_invitation_batches(now=NOW)
    db.session.expire_all()


def _resolved(prompt, vacancy_id):
    from padel_app.models import Message

    meta = db.session.get(Message, prompt.message_id).msg_metadata
    return next(v for v in meta["vacancies"] if v["vacancyId"] == vacancy_id).get("resolved")


def test_the_tick_resolves_prompts_on_spots_filled_or_expired_behind_the_listener(app):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    with app.app_context():
        _world, [(v1, p1, _b1), (v2, p2, _b2)] = _declines("orph1", 2)
        _close_behind_the_listener(v1, "filled")
        _close_behind_the_listener(v2, "expired")
        assert db.session.get(ReplacementApprovalPrompt, p1.id).status == "pending"
        _tick()
        for prompt in (p1, p2):
            row = db.session.get(ReplacementApprovalPrompt, prompt.id)
            assert row.status == "stale"
            assert row.decided_at is not None
        assert _resolved(p1, v1.id) == "filled"
        assert _resolved(p2, v2.id) == "expired"


def _one_bundle(prefix):
    """Two declines answered in one bundle, as on prod (one bundle mixed open and filled spots)."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.services.notification_service import _ensure_vacancy_for_player
    from padel_app.services.replacement_approval_service import create_approval_prompts
    from padel_app.tests.test_semi_auto_approval import _mark_absent

    world = _seed_world(prefix, n_candidates=1, enrolled=2, max_players=3)
    vacancies = []
    for _, player in world["enrolled"][:2]:
        _mark_absent(world["instance"], player)
        vacancies.append(_ensure_vacancy_for_player(world["instance"], world["coach"].id, player.id))
    with _patched_io():
        create_approval_prompts(vacancies, world["instance"], world["coach"].id, world["config"])
    prompts = [ReplacementApprovalPrompt.query.filter_by(vacancy_id=v.id).first() for v in vacancies]
    assert prompts[0].bundle_id == prompts[1].bundle_id
    return vacancies, prompts


def test_the_tick_leaves_a_pending_prompt_on_an_open_spot(app):
    """A bundle with one spot filled behind the listener and one still open: per spot, as the
    listener does — the filled one resolves, the open one stays pending and undecided."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    with app.app_context():
        (v_open, v_filled), (p_open, p_filled) = _one_bundle("orph2")
        _close_behind_the_listener(v_filled, "filled")
        _tick()
        assert db.session.get(ReplacementApprovalPrompt, p_filled.id).status == "stale"
        assert _resolved(p_filled, v_filled.id) == "filled"
        assert db.session.get(ReplacementApprovalPrompt, p_open.id).status == "pending"
        assert _resolved(p_open, v_open.id) is None


def test_the_tick_leaves_a_decided_prompt_on_a_closed_spot(app):
    """A dismissed prompt on a closed spot keeps its decision; a pending one beside it resolves."""
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    with app.app_context():
        _world, [(v1, p1, _b1), (v2, p2, _b2)] = _declines("orph3", 2)
        prompt = db.session.get(ReplacementApprovalPrompt, p1.id)
        prompt.status = "dismissed"
        db.session.commit()
        _close_behind_the_listener(v1, "filled")
        _close_behind_the_listener(v2, "filled")
        _tick()
        assert db.session.get(ReplacementApprovalPrompt, p1.id).status == "dismissed"
        assert _resolved(p1, v1.id) is None
        assert db.session.get(ReplacementApprovalPrompt, p2.id).status == "stale"
        assert _resolved(p2, v2.id) == "filled"
