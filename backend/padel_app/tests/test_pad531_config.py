"""PAD-531 admin.foundation rule 13: configuration.

"Production refuses to start without the admin hosts": ADMIN_HOSTS is asserted, the Google client
id is not (an empty id degrades to "not configured", coordinator decision 2026-10-07). The four
tracked env templates carry both keys so the deploy never ships a container without its hosts.
"""
import pathlib

import pytest

from padel_app.config import assert_production_secrets

BACKEND = pathlib.Path(__file__).resolve().parents[2]
GOOD = {"FLASK_SECRET_KEY": "real-secret", "JWT_SECRET_KEY": "real-jwt", "ADMIN_HOSTS": "admin.levapp.app"}


def test_production_refuses_to_start_without_admin_hosts():
    env = dict(GOOD, ADMIN_HOSTS="")
    with pytest.raises(RuntimeError) as exc:
        assert_production_secrets(env)
    assert "ADMIN_HOSTS" in str(exc.value)


def test_an_empty_google_client_id_does_not_stop_production():
    assert_production_secrets(dict(GOOD, ADMIN_GOOGLE_CLIENT_ID="")) is None


@pytest.mark.parametrize(
    "template, hosts",
    [(".env.dev", "localhost,127.0.0.1"), (".env.local.dev", "localhost,127.0.0.1"),
     (".env.staging", "admin.staging.levapp.app"), (".env.prod", "admin.levapp.app")],
)
def test_every_env_template_names_its_admin_hosts(template, hosts):
    text = (BACKEND / template).read_text()
    lines = {line.split("=", 1)[0]: line.split("=", 1)[1] for line in text.splitlines() if "=" in line and not line.startswith("#")}
    assert lines.get("ADMIN_HOSTS") == hosts
    assert "ADMIN_GOOGLE_CLIENT_ID" in lines  # public id; empty until the owner fills it in


def test_admin_hosts_are_parsed_lower_cased():
    from padel_app.config import Config, parse_admin_hosts

    assert parse_admin_hosts(" Admin.LevApp.app , admin.staging.levapp.app ,, ") == (
        "admin.levapp.app", "admin.staging.levapp.app",
    )
    assert parse_admin_hosts("") == () and parse_admin_hosts(None) == ()
    assert isinstance(Config.ADMIN_HOSTS, tuple)


STAFF_CONSOLE_CLIENT_ID = "468098103039-hptfeqt5uss7uh1g45ska9vnjcu63vd5.apps.googleusercontent.com"


@pytest.mark.parametrize("template", [".env.staging", ".env.prod"])
def test_the_deployed_templates_carry_the_staff_console_client_id(template):
    """admin.foundation rule 13: the "LevApp Staff Console web" client (in the
    VM's GCP project), one id for both hosts; it is public, so it is tracked."""
    text = (BACKEND / template).read_text()
    lines = {line.split("=", 1)[0]: line.split("=", 1)[1] for line in text.splitlines() if "=" in line and not line.startswith("#")}
    assert lines.get("ADMIN_GOOGLE_CLIENT_ID") == STAFF_CONSOLE_CLIENT_ID
