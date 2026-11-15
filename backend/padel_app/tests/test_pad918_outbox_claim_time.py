"""PAD-918, found on the staging rehearsal: an outbox row's ``dispatched_at`` is the send's clock (the
instant dispatch claims it), not the effect's ``at``, so a drain or stuck-row measure can read it."""
from datetime import timedelta

from padel_app.models import EngineEffect
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, _seed


def test_the_outbox_claim_time_is_the_sends_clock_not_the_effects_at(app, monkeypatch):
    from padel_app.services import engine_outbox, engine_store
    from padel_app.services.engine_runner import send_outbox

    sent_at = NOW + timedelta(seconds=7)
    with app.app_context():
        _, (session,), _ = _seed(app)
        db.session.add(EngineEffect(lesson_instance_id=int(session), kind="Message", at=NOW, payload={}, key="claim-1"))
        db.session.commit()
        monkeypatch.setattr(engine_store, "utcnow_naive", lambda: sent_at)
        monkeypatch.setattr(engine_outbox, "send_effect", lambda row: None)

        assert send_outbox() == 1
        assert EngineEffect.query.filter_by(key="claim-1").one().dispatched_at == sent_at
