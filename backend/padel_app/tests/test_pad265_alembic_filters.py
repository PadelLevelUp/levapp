"""PAD-265 / audit H13 — autogenerate never proposes dropping APScheduler's job store.

apscheduler_jobs is created by APScheduler's SQLAlchemyJobStore at startup and
declared by no model, so without a filter every `flask db migrate` proposed
dropping it (revision 3ff75d01a5ee already did once). The tests run Alembic's
real comparison against a database that holds the table.
"""
from pathlib import Path

import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from padel_app.tools.alembic_filters import EXTERNAL_TABLES, include_object


def _db_with_the_job_store():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE apscheduler_jobs (id VARCHAR(191) PRIMARY KEY, "
            "next_run_time FLOAT, job_state BLOB NOT NULL)"
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_apscheduler_jobs_next_run_time ON apscheduler_jobs (next_run_time)"
        ))
    return engine


def _diff(engine, **opts):
    with engine.connect() as conn:
        return compare_metadata(MigrationContext.configure(conn, opts=opts), sa.MetaData())


def test_without_the_filter_autogenerate_would_drop_the_job_store():
    ops = _diff(_db_with_the_job_store())
    assert any(op[0] == "remove_table" and op[1].name == "apscheduler_jobs" for op in ops)


def test_with_the_filter_the_job_store_is_left_alone():
    assert _diff(_db_with_the_job_store(), include_object=include_object, compare_type=True) == []


def test_our_own_tables_are_still_compared():
    users = sa.Table("users", sa.MetaData(), sa.Column("id", sa.Integer))
    assert include_object(users, "users", "table", False, None) is True
    assert "apscheduler_jobs" in EXTERNAL_TABLES


def test_env_py_passes_the_filter_in_both_modes():
    env = (Path(__file__).resolve().parents[2] / "migrations" / "env.py").read_text()
    assert "from padel_app.tools.alembic_filters import include_object" in env
    assert env.count("include_object=include_object") == 1  # offline
    assert 'conf_args.setdefault("include_object", include_object)' in env  # online
    assert "compare_type=True" in env and 'conf_args.setdefault("compare_type", True)' in env
