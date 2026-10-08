"""The backend CI lanes have room to finish (2026-10-08).

The Postgres lane takes 44-45 minutes; at a 45-minute cap #558's run reached [100%] with no
failures and was cancelled four seconds later, which blocked every PR. The caps are now 75
(Postgres) and 60 (SQLite). This pins them, read as text like test_pad534_image_knows_its_commit:
lowering either back, or losing it, turns this red.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "backend-tests.yaml"


def _timeout_of(job_name: str) -> int:
    text = WORKFLOW.read_text()
    # The job's own keys follow its `name:`; the first timeout-minutes after it is the job's.
    after_name = text.split(f"name: {job_name}", 1)[1]
    match = re.search(r"^\s+timeout-minutes:\s*(\d+)", after_name, re.MULTILINE)
    assert match, f"no timeout-minutes after the {job_name!r} job's name"
    return int(match.group(1))


def test_the_postgres_lane_has_75_minutes():
    assert _timeout_of("pytest (postgres, real migrations)") == 75


def test_the_sqlite_lane_has_60_minutes():
    assert _timeout_of("pytest (sqlite, FK on)") == 60
