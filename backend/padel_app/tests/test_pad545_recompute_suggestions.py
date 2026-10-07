"""
PAD-545 / PAD-542 — semi-automatic suggestions: ignoring is reversible from the class, by
recomputing (semi-auto-approval rule 12; numbering unconfirmed).

- "Ignorar" (action "dismiss") still stops the engine for the vacancy; nothing is ever auto-sent.
- The class view reads the suggestion state (`instance_suggestions`): pending | dismissed | none.
- "Sugestão de convites automáticos" (`recompute_suggestions`) re-opens the class's pending and
  dismissed vacancies as pending, moves each prompt to a NEW bundle computed from the class's state
  now, and posts one new Assistant message — one commit, nothing sent.
- An older message's buttons answer "stale" for every vacancy and decide nothing.
"""
from datetime import datetime

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_semi_auto_approval import (
    _create_coach_player,
    _create_pending_prompt,
    _create_player,
    _create_user,
    _patched_io,
    _seed_world,
)


def _auto_events():
    from padel_app.models.notification_event import NotificationEvent
    return NotificationEvent.query.filter_by(type="auto").count()


def _approval_messages():
    from padel_app.models import Message
    return Message.query.filter_by(message_type="replacement_approval").order_by(Message.id).all()


def test_ignore_then_recompute_asks_again_and_sends_nothing(app):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.replacement_approval_service import (
        instance_suggestions, recompute_suggestions, respond_to_approval,
    )

    with app.app_context():
        world = _seed_world("rc1", n_candidates=1)
        _, declined = world["enrolled"][0]
        vacancy, _prompt, bundle = _create_pending_prompt(world, declined)
        coach_id, instance_id = world["coach"].id, world["instance"].id
        assert instance_suggestions(instance_id, coach_id)["state"] == "pending"

        now = datetime.utcnow()
        with _patched_io():
            respond_to_approval(bundle["bundleId"], "dismiss", coach_id, now=now)
        assert instance_suggestions(instance_id, coach_id)["state"] == "dismissed"

        with _patched_io():
            result = recompute_suggestions(instance_id, coach_id, now=now)
        assert result["state"] == "pending"
        assert result["bundle"]["bundleId"] != bundle["bundleId"]
        assert Vacancy.query.get(vacancy.id).approval_status == "pending"
        assert _auto_events() == 0, "a recompute must never send"
        assert len(_approval_messages()) == 2, "the recompute posts a new Assistant message"
        state = instance_suggestions(instance_id, coach_id)
        assert state["state"] == "pending" and state["bundle"]["bundleId"] == result["bundle"]["bundleId"]


def test_an_old_messages_yes_after_a_recompute_decides_nothing_and_says_so(app):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.replacement_approval_service import recompute_suggestions, respond_to_approval

    with app.app_context():
        world = _seed_world("rc2", n_candidates=1)
        _, declined = world["enrolled"][0]
        vacancy, _prompt, old = _create_pending_prompt(world, declined)
        coach_id, instance_id = world["coach"].id, world["instance"].id
        now = datetime.utcnow()
        with _patched_io():
            respond_to_approval(old["bundleId"], "dismiss", coach_id, now=now)
            new = recompute_suggestions(instance_id, coach_id, now=now)["bundle"]
            late = respond_to_approval(old["bundleId"], "yes_now", coach_id, now=now)
        assert late["vacancies"] == [{"vacancyId": vacancy.id, "result": "stale"}]
        assert _auto_events() == 0
        assert Vacancy.query.get(vacancy.id).approval_status == "pending"
        assert late.get("superseded") is True, "the old message says why: the list was recomputed"

        with _patched_io():
            fresh = respond_to_approval(new["bundleId"], "yes_now", coach_id, now=now)
        assert fresh["vacancies"][0]["result"] == "approved_now"
        assert _auto_events() == 1, "the new bundle's yes sends"


def test_a_pending_bundle_is_superseded_by_a_recompute_too(app):
    from padel_app.services.replacement_approval_service import recompute_suggestions, respond_to_approval

    with app.app_context():
        world = _seed_world("rc3", n_candidates=1)
        _, declined = world["enrolled"][0]
        vacancy, _prompt, old = _create_pending_prompt(world, declined)
        now = datetime.utcnow()
        with _patched_io():
            recompute_suggestions(world["instance"].id, world["coach"].id, now=now)
            late = respond_to_approval(old["bundleId"], "yes_now", world["coach"].id, now=now)
        assert late["vacancies"] == [{"vacancyId": vacancy.id, "result": "stale"}]
        assert _auto_events() == 0


def test_the_recompute_reads_the_class_as_it_is_now(app):
    """A student added to the roster after the first list appears in the recomputed one."""
    from padel_app.services.replacement_approval_service import recompute_suggestions, respond_to_approval

    with app.app_context():
        world = _seed_world("rc4", n_candidates=1)
        _, declined = world["enrolled"][0]
        _vacancy, _prompt, old = _create_pending_prompt(world, declined)
        before = {e["id"] for e in old["vacancies"][0]["queue"]}
        newcomer = _create_player(_create_user("Newcomer rc4", "new-rc4"))
        _create_coach_player(world["coach"], newcomer, world["level"])
        db.session.commit()
        now = datetime.utcnow()
        with _patched_io():
            respond_to_approval(old["bundleId"], "dismiss", world["coach"].id, now=now)
            new = recompute_suggestions(world["instance"].id, world["coach"].id, now=now)["bundle"]
        after = {e["id"] for e in new["vacancies"][0]["queue"]}
        assert str(newcomer.id) not in {str(i) for i in before}
        assert str(newcomer.id) in {str(i) for i in after}


def test_nothing_to_suggest_and_an_approved_vacancy_is_not_reopened(app):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.replacement_approval_service import (
        instance_suggestions, recompute_suggestions, respond_to_approval,
    )

    with app.app_context():
        world = _seed_world("rc5", n_candidates=1)
        assert instance_suggestions(world["instance"].id, world["coach"].id) == {"state": "none", "semiAutomatic": True}
        _, declined = world["enrolled"][0]
        vacancy, _prompt, bundle = _create_pending_prompt(world, declined)
        now = datetime.utcnow()
        with _patched_io():
            respond_to_approval(bundle["bundleId"], "yes_now", world["coach"].id, now=now)
            assert recompute_suggestions(world["instance"].id, world["coach"].id, now=now) == {"state": "none"}
        assert Vacancy.query.get(vacancy.id).approval_status == "approved"


def test_the_endpoints_are_the_classs_coachs_only(app, client):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        world = _seed_world("rc6", n_candidates=1)
        other = _seed_world("rc6b", n_candidates=0)
        own = create_access_token(identity=str(world["coach_user"].id))
        stranger = create_access_token(identity=str(other["coach_user"].id))
        instance_id = world["instance"].id
    get = lambda tok: client.get(f"/api/app/notify/approval/instance/{instance_id}",
                                 headers={"Authorization": f"Bearer {tok}"})
    post = lambda tok: client.post(f"/api/app/notify/approval/instance/{instance_id}/recompute",
                                   headers={"Authorization": f"Bearer {tok}"})
    assert get(own).status_code == 200 and get(own).get_json() == {"state": "none", "semiAutomatic": True}
    assert get(stranger).status_code == 403
    with _patched_io():
        assert post(stranger).status_code == 403
        assert post(own).get_json() == {"state": "none"}


# ── Postgres only: an old bundle's yes racing a recompute ───────────────────────────────────────
import os
import threading
from unittest.mock import patch as _patch

import pytest

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


@POSTGRES_ONLY
def test_a_yes_on_the_old_bundle_racing_a_recompute_lands_on_one_side(app, monkeypatch):
    """Both callers are held just before their vacancy locks until the other has arrived. Whoever
    locks first decides: either the yes approves and sends (the recompute then finds nothing to
    re-open), or the recompute moves the prompt and the yes answers "stale" and sends nothing.
    Never both, never a deadlock. A respond that did not re-read its prompt under the lock would
    approve a vacancy the recompute had just re-opened as pending."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import replacement_approval_service as ras

    with app.app_context():
        world = _seed_world("race545", n_candidates=1)
        _, declined = world["enrolled"][0]
        vacancy, _prompt, old = _create_pending_prompt(world, declined)
        coach_id, instance_id, vacancy_id = world["coach"].id, world["instance"].id, vacancy.id
    now = datetime.utcnow()
    gate = threading.Barrier(2)

    def wait():
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass

    real_coached, real_now = ras._coached_instance, ras.utcnow_naive

    def gated_coached(*a, **k):
        found = real_coached(*a, **k)
        wait()
        return found

    def gated_now():
        wait()
        return now

    monkeypatch.setattr(ras, "_coached_instance", gated_coached)   # recompute, before its locks
    monkeypatch.setattr(ras, "utcnow_naive", gated_now)            # respond, before its locks
    out, errors = {}, []

    def run(name, fn):
        def go():
            try:
                with app.app_context(), _patched_io(), \
                        _patch("padel_app.services.notification_service.publish"), \
                        _patch("padel_app.services.notification_service.send_push_notification"):
                    out[name] = fn()
                    db.session.remove()
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
        return threading.Thread(target=go)

    threads = [
        run("yes", lambda: ras.respond_to_approval(old["bundleId"], "yes_now", coach_id)),
        run("recompute", lambda: ras.recompute_suggestions(instance_id, coach_id, now=now)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "a caller never finished (deadlock?)"
    assert not errors, errors

    with app.app_context():
        status = db.session.get(Vacancy, vacancy_id).approval_status
        sent = _auto_events()
    yes = out["yes"]["vacancies"][0]["result"]
    if yes == "approved_now":
        assert out["recompute"] == {"state": "none"} and status == "approved" and sent == 1
    else:
        assert yes == "stale" and out["recompute"]["state"] == "pending"
        assert status == "pending" and sent == 0
