"""PAD-643 — delivery.transport-security: the VM's nginx sends HSTS on every HTTPS product and API
host and speaks TLS 1.2 and 1.3 only. The files under infra/nginx are what the VM runs (they are
hand-applied; infra/nginx/README.md).

nginx drops every server-level `add_header` inside a location that sets its own, so a location with
an add_header must repeat HSTS.
"""
import pathlib
import re

import pytest

NGINX = pathlib.Path(__file__).resolve().parents[3] / "infra" / "nginx"
HSTS = 'add_header Strict-Transport-Security "max-age=31536000" always;'
#: The staff console's container sends its own HSTS (frontend/apps/admin/security-headers.conf).
HOSTS = ["levapp", "levapp-staging", "padellevelup", "levapp-api", "levapp-api-staging"]


def _strip_comments(text):
    return "\n".join(line.split("#", 1)[0] for line in text.splitlines())


def _blocks(text, keyword):
    """Every `<keyword> ... { ... }` block's body, by brace depth."""
    out = []
    for m in re.finditer(rf"\b{keyword}\b[^{{;]*\{{", text):
        depth, i = 1, m.end()
        while depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        out.append(text[m.end():i - 1])
    return out


def _https_servers(name):
    text = _strip_comments((NGINX / "sites-available" / name).read_text())
    return [b for b in _blocks(text, "server") if re.search(r"listen\s+443\b", b)]


@pytest.mark.parametrize("name", HOSTS)
def test_every_https_server_sends_hsts(name):
    servers = _https_servers(name)
    assert servers, f"{name} has no HTTPS server block"
    for body in servers:
        top_level = re.sub(r"location\b[^{]*\{(?:[^{}]|\{[^{}]*\})*\}", "", body)
        assert HSTS in top_level, f"{name}: the HTTPS server does not send HSTS"


@pytest.mark.parametrize("name", HOSTS)
def test_a_location_with_its_own_headers_repeats_hsts(name):
    for body in _https_servers(name):
        for loc in _blocks(body, "location"):
            if "add_header" in loc:
                assert HSTS in loc, f"{name}: a location with add_header drops the server's HSTS"


def test_only_tls_1_2_and_1_3():
    text = _strip_comments((NGINX / "nginx.conf").read_text())
    protocols = re.findall(r"ssl_protocols\s+([^;]+);", text)
    assert protocols == ["TLSv1.2 TLSv1.3"]
