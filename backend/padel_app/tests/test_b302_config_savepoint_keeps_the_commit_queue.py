"""B-302 follow-up (Session-B's check on #592): `get_or_create_config` now inserts in a SAVEPOINT, and
in SQLAlchemy 1.4 a savepoint's release fires `after_commit` and its rollback fires `after_rollback`.
Work a caller queued with `on_commit` earlier in the same transaction must neither run at the savepoint
(published before the real commit) nor be dropped by the savepoint's rollback on the conflict path.
Inside a unit of work (no commit of its own), both paths leave the queue for the real commit.
(Outside a unit of work the create commits for real, as `config.create()` always did: unchanged.)"""
from padel_app.sql_db import db


def _coach(tag):
    from padel_app.models import Coach, User

    u = User(name=f"Q {tag}", username=f"b302q{tag}", email=f"b302q{tag}@t.test", password="x", status="active")
    db.session.add(u)
    db.session.flush()
    coach = Coach(user_id=u.id)
    db.session.add(coach)
    db.session.commit()
    return coach.id


def test_the_release_path_keeps_the_queue_for_the_real_commit(app):
    from padel_app.services.notification_service import get_or_create_config
    from padel_app.tools.after_commit import on_commit
    from padel_app.tools.unit_of_work import unit_of_work

    with app.app_context():
        coach_id = _coach("rel")
        ran = []
        with unit_of_work():
            on_commit(lambda: ran.append("published"))
            cfg = get_or_create_config(coach_id)  # no row: insert in a savepoint, released
            assert cfg.id is not None
            assert ran == [], "the savepoint's release ran the queue before the real commit"
        assert ran == ["published"], "the real commit runs it once"


def test_the_conflict_path_neither_runs_nor_drops_the_queue(app, monkeypatch):
    """Simulate the race: the read says 'none' while the row exists, so the savepoint's insert hits the
    unique key and is rolled back. The queued work survives to the real commit, and runs once."""
    from padel_app.models import NotificationConfig
    from padel_app.services import notification_service as ns
    from padel_app.tools.after_commit import on_commit
    from padel_app.tools.unit_of_work import unit_of_work

    with app.app_context():
        coach_id = _coach("conf")
        existing = NotificationConfig(coach_id=coach_id, auto_notify_enabled=False)
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id

        real = NotificationConfig

        class _FirstReadSaysNone:
            calls = 0

            def __getattr__(self, name):
                return getattr(real, name)

            def __call__(self, **kw):
                return real(**kw)

        proxy = _FirstReadSaysNone()

        class _Query:
            def filter_by(self, **kw):
                proxy.calls += 1
                q = real.query.filter_by(**kw)
                if proxy.calls == 1:
                    return q.filter(db.false())  # the first read misses the row
                return q

        monkeypatch.setattr(_FirstReadSaysNone, "query", _Query(), raising=False)
        monkeypatch.setattr(ns, "NotificationConfig", proxy)

        ran = []
        with unit_of_work():
            on_commit(lambda: ran.append("published"))
            cfg = ns.get_or_create_config(coach_id)
            assert cfg.id == existing_id, "the conflict re-reads the committed row"
            assert ran == [], "the savepoint's rollback or release touched the queue"
        assert ran == ["published"], "the queue survived the savepoint's rollback and ran at the commit"
        assert real.query.filter_by(coach_id=coach_id).count() == 1
