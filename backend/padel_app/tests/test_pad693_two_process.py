"""PAD-693 — two app processes on one Postgres draw on ONE login budget (`auth.login` rule 7).

Same harness as PAD-692 (`two_process_app`). One IP (127.0.0.1) sends six wrong-password logins
alternating between processes A and B with `AUTH_RATE_LIMIT_LOGIN=4/60`. With the database store
exactly four are processed (401) and two refused (429); with the memory store each process keeps
its own budget and all six are processed — the 2×2 arm that shows the harness can tell them apart.

Marked ``two_process``: deselected unless ``LEVAPP_TWO_PROCESS=1`` (the Postgres CI lane sets it).
"""
import os

import pytest
import requests

from padel_app.tests.test_pad692_two_process import Proc

pytestmark = [
    pytest.mark.two_process,
    pytest.mark.skipif(
        os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
        reason="the shared store needs Postgres",
    ),
]


@pytest.mark.parametrize("store,expected", [("database", [401] * 4 + [429] * 2), ("memory", [401] * 6)])
def test_a_login_burst_across_two_processes_draws_on_one_budget(app, postgres_test_database_uri, store, expected):
    env = {"AUTH_RATE_LIMIT_STORE": store, "AUTH_RATE_LIMIT_LOGIN": "4/60"}
    a = Proc(postgres_test_database_uri, "memory", env)
    b = Proc(postgres_test_database_uri, "memory", env)
    try:
        codes = []
        for i in range(6):
            proc = (a, b)[i % 2]
            r = requests.post(f"{proc.base}/api/auth/login", json={"username": "nobody", "password": "x"}, timeout=10)
            codes.append(r.status_code)
    finally:
        a.stop()
        b.stop()
    assert sorted(codes) == sorted(expected), codes
