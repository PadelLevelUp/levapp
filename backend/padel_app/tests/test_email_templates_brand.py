"""The verification mail has to survive being used by a human on a phone.

Two regressions this pins, both reported from a real TestFlight sign-up:
the code could not be pasted, and the header was the word "LevApp" typed out
rather than the brand lockup.
"""

import re

from padel_app.tools.email_templates import render_verification_code_email


class _User:
    email = "someone@example.com"
    language = "pt"
    name = "Alguém"


def _html(app, code="483920"):
    with app.app_context():
        _subject, _text, html = render_verification_code_email(_User(), code)
        return html


def test_the_code_is_one_selectable_token(app):
    """Spacing must be presentational, never characters in the string.

    `" ".join(code)` looked identical and copied "4 8 3 9 2 0", which the code
    field rejects — so people retyped it by hand.
    """
    html = _html(app)

    assert ">483920<" in html
    assert "4 8 3 9 2 0" not in html


def test_the_code_still_reads_as_separate_digits(app):
    """Losing the visual spacing would trade one usability bug for another."""
    html = _html(app)
    block = re.search(r'<p[^>]*monospace[^>]*>483920</p>', html)

    assert block, "code block not found"
    assert "letter-spacing" in block.group(0)


def test_the_header_uses_the_lockup_not_the_word(app):
    html = _html(app)

    assert "/brand/levapp-lockup-on-light.png" in html
    assert 'alt="LevApp"' in html, "a blocked image must still read as the brand"


def test_the_lockup_is_an_absolute_url(app):
    """Mail clients have no page origin to resolve a relative path against."""
    html = _html(app)
    src = re.search(r'<img src="([^"]+)"', html)

    assert src and src.group(1).startswith("https://"), src.group(1) if src else None
