"""auth.email-verification rule 7 / B-032 (PAD-251).

Transactional mail is read in a mail client, which has no page origin to
resolve anything against, so every image and link is absolute — and it must be
rooted at the origin of the environment that SENT the mail. Staging mail that
loads its lockup from prod cannot test staging's own assets, and before prod was
promoted it showed a broken image (the SPA fallback answered 200 text/html, so
nothing but a human noticed).

Two things are pinned: the env files each deployed environment boots from set
`PUBLIC_WEB_ORIGIN` to their own origin, and the renderer honours it.
"""

import re
from pathlib import Path

from padel_app.tools.email_templates import (
    render_coach_approved_email,
    render_verification_code_email,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]
STAGING_ORIGIN = "https://staging.levapp.app"
PROD_ORIGIN = "https://levapp.app"


def _env_value(filename, key):
    text = (BACKEND_DIR / filename).read_text()
    match = re.search(rf"^{re.escape(key)}=(.*)$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


class _User:
    email = "someone@example.com"
    language = "pt"
    name = "Alguém"


def test_staging_env_file_names_its_own_origin():
    assert _env_value(".env.staging", "PUBLIC_WEB_ORIGIN") == STAGING_ORIGIN


def test_prod_env_file_names_its_own_origin():
    assert _env_value(".env.prod", "PUBLIC_WEB_ORIGIN") == PROD_ORIGIN


def test_verification_mail_is_rooted_at_the_configured_origin(app):
    app.config["PUBLIC_WEB_ORIGIN"] = STAGING_ORIGIN
    with app.app_context():
        _subject, text, html = render_verification_code_email(_User(), "166315")

    src = re.search(r'<img src="([^"]+)"', html)
    assert src and src.group(1) == f"{STAGING_ORIGIN}/brand/levapp-lockup-on-light.png"
    for href in re.findall(r'href="([^"]+)"', html):
        assert href.startswith(STAGING_ORIGIN), href
    assert PROD_ORIGIN + "/" not in html and PROD_ORIGIN + "/" not in text


def test_approval_mail_is_rooted_at_the_configured_origin(app):
    app.config["PUBLIC_WEB_ORIGIN"] = STAGING_ORIGIN
    with app.app_context():
        _subject, text, html = render_coach_approved_email(_User())

    assert f'href="{STAGING_ORIGIN}/auth"' in html
    assert f"{STAGING_ORIGIN}/auth" in text
    assert PROD_ORIGIN + "/" not in html and PROD_ORIGIN + "/" not in text
