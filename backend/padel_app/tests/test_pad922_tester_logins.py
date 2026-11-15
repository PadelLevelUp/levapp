"""PAD-922 — both staging tester logins work after a scrub, and the sync fails when one does not.

Spec: ``specflow/impl/delivery/staging-data-sync.spec.md`` rules 10, 11, 11a. Two layers:
- the script (every backend): the PAD-589 harness with a ``docker`` wrapper that answers the
  password hash and the in-container login check; no Docker, Postgres or network;
- the scrub (Postgres only, like test_pad606): the tester pick and the shared hash.
"""
import os
import re
import stat
from datetime import date
from pathlib import Path

import pytest

from padel_app.tests.test_pad589_staging_sync import NEW, OLD, run, sandbox  # noqa: F401  (fixture)

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SCRUB_SQL = SCRIPTS / "staging-scrub.sql"
WORKFLOW = SCRIPTS.parents[1] / ".github" / "workflows" / "deploy-staging.yaml"

# Wraps the PAD-589 docker stub: the hash step and the login check run `docker exec <app> python -c`.
WRAPPER = r"""#!/usr/bin/env bash
if [ "$1" = exec ] && [ "$3" = python ]; then
  case "$*" in
    *generate_password_hash*) [ -n "${STUB_NO_SECRET:-}" ] || echo 'pbkdf2:sha256:1$stub$hash'; exit 0 ;;
    *"tester login"*)
      echo "docker $*" >> "$STUB_HOME/calls.log"
      echo "tester login staging-coach: ${STUB_COACH_CODE:-200}"
      echo "tester login staging-student: ${STUB_STUDENT_CODE:-200}"
      [ "${STUB_COACH_CODE:-200}" = 200 ] && [ "${STUB_STUDENT_CODE:-200}" = 200 ] && exit 0
      exit 1 ;;
  esac
fi
exec "$REAL_DOCKER" "$@"
"""


@pytest.fixture
def wrapped(sandbox):  # noqa: F811
    bin_dir = Path(sandbox["env"]["PATH"].split(":")[0])
    real = bin_dir / "docker"
    real.rename(bin_dir / "docker-real")
    wrapper = bin_dir / "docker"
    wrapper.write_text(WRAPPER)
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC)
    sandbox["env"]["REAL_DOCKER"] = str(bin_dir / "docker-real")
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    return sandbox


@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_both_tester_logins_answering_200_leave_the_sync_green(wrapped):
    result, calls = run(wrapped)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "tester login staging-coach: 200" in result.stdout
    assert "tester login staging-student: 200" in result.stdout
    assert "-e STAGING_TEST_PASSWORD" not in calls, "the password is read inside the container, never passed in"


@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_a_refused_tester_login_ends_the_sync_with_exit_5(wrapped):
    result, calls = run(wrapped, STUB_STUDENT_CODE="401")
    assert result.returncode == 5, result.stdout + result.stderr
    assert "tester login staging-student: 401" in result.stdout
    assert (wrapped["home"] / "staging-sync.state").read_text().strip().endswith(NEW), "the scrub itself succeeded"


@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_without_the_secret_or_without_a_restore_no_login_is_tried(wrapped):
    result, calls = run(wrapped, STUB_NO_SECRET="1", STUB_STUDENT_CODE="401")
    assert result.returncode == 0 and "tester login staging" not in result.stdout
    assert "tester logins not checked" in result.stdout
    # already restored: the script skips before anything is touched
    (wrapped["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{NEW}\n")
    skipped, _ = run(wrapped, STUB_STUDENT_CODE="401")
    assert skipped.returncode == 0 and "tester login" not in skipped.stdout


@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_a_scrub_failure_keeps_its_own_exit_code(wrapped):
    result, _ = run(wrapped, STUB_SCRUB_FAILS="1", STUB_STUDENT_CODE="401")
    assert result.returncode == 3, result.stdout + result.stderr


@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_the_deploy_verdict_fails_the_job_on_exit_5():
    workflow = WORKFLOW.read_text()
    assert re.search(r"^\s*5\) echo .*exit 5 ;;", workflow, re.M)
    assert "tester login" in workflow, "the tester lines reach the job summary"


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="the scrub is Postgres SQL (temp tables, jsonb, make_date)",
)
@pytest.mark.criterion("DELIVERY-STAGING-DATA-SYNC-15")
def test_on_postgres_the_testers_can_log_in_whatever_their_account_was(app):
    """A social-only student, a placeholder and a disabled account all sit below the right pick."""
    from sqlalchemy import text

    from padel_app.sql_db import db

    shared = "pbkdf2:sha256:600000$shared$hash"
    with app.app_context():
        from padel_app.models import Association_CoachPlayer, Player, User
        from padel_app.models.coaches import Coach

        def user(name, **kw):
            u = User(name=name, username=kw.pop("username", name.lower().replace(" ", ".") + "@gmail.com"),
                     email=name.lower().replace(" ", ".") + "@gmail.com", birth_date=date(1990, 5, 5), **kw)
            db.session.add(u)
            db.session.flush()
            return u

        coach_user = user("Ana Ferreira", password="pbkdf2:sha256:1$a$b")
        placeholder = user("Rita Sousa", username="pending-0123456789abcdef")
        disabled = user("Rui Lopes", password="pbkdf2:sha256:1$c$d", status="disabled")
        social_only = user("Joao Martins")  # signed in with Google only: no password
        later = user("Sara Costa", password="pbkdf2:sha256:1$e$f")
        coach = Coach(user_id=coach_user.id)
        db.session.add(coach)
        players = [Player(user_id=u.id) for u in (placeholder, disabled, social_only, later)]
        db.session.add_all(players)
        db.session.flush()
        for p in players:
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
        db.session.commit()
        ids = {"coach": coach_user.id, "student": social_only.id, "placeholder": placeholder.id,
               "disabled": disabled.id, "later": later.id}

        sql = SCRUB_SQL.read_text().replace(":'pwhash'", f"'{shared}'")
        conn = db.session.connection()
        conn.connection.dbapi_connection.cursor().execute(sql)
        rows = {r.id: r for r in conn.execute(text("SELECT id, username, password FROM users")).all()}

        assert rows[ids["coach"]].username == "staging-coach" and rows[ids["coach"]].password == shared
        assert rows[ids["student"]].username == "staging-student", "the lowest-id claimed, active student"
        assert rows[ids["student"]].password == shared, "set although the account had no password"
        assert rows[ids["placeholder"]].username == "pending-0123456789abcdef"
        assert rows[ids["placeholder"]].password is None
        assert rows[ids["disabled"]].username != "staging-student"
        assert rows[ids["later"]].username != "staging-student"
        assert sum(r.username in ("staging-coach", "staging-student") for r in rows.values()) == 2
