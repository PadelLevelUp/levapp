"""PAD-458 / B-220 (auth.email-verification rule 8c): the verify screen says how long the
code lives, and the resend countdown never reads as that deadline.

The founders read "Send a new code (54s)" as the code's lifetime, while the email said
15 minutes. The server was right all along (rule 3, CODE_TTL); the screen never stated the
validity, so the only number on it was the 60-second resend cooldown (rule 4).

The copy is pinned to the constant here, so changing CODE_TTL without the words that
describe it goes red. It reads the shared locale files that both clients load.
"""
import json
import pathlib

from padel_app.services.email_verification_service import CODE_TTL, RESEND_COOLDOWN
from padel_app.tools import email_templates

LOCALES = pathlib.Path(__file__).resolve().parents[3] / "frontend/src/locales"
MINUTES = int(CODE_TTL.total_seconds() // 60)


def _verify_copy(lang):
    return json.loads((LOCALES / lang / "auth.json").read_text(encoding="utf-8"))["auth"]["verifyEmail"]


def test_email_states_the_code_ttl():
    assert f"{MINUTES} minut" in email_templates._VERIFY["pt"]["valid"]
    assert f"{MINUTES} minut" in email_templates._VERIFY["en"]["valid"]


def test_verify_screen_hint_states_the_code_ttl_in_both_languages():
    assert f"{MINUTES} minutos" in _verify_copy("pt")["hint"]
    assert f"{MINUTES} minutes" in _verify_copy("en")["hint"]


def test_resend_countdown_reads_as_when_a_new_code_can_be_asked_for():
    # Not "<Send a new code> (54s)": the seconds follow "em"/"in", naming when the
    # button comes back, and the cooldown is never phrased as the code's validity.
    assert RESEND_COOLDOWN.total_seconds() < CODE_TTL.total_seconds()
    pt, en = _verify_copy("pt")["resendIn"], _verify_copy("en")["resendIn"]
    assert pt.endswith(" em {{seconds}}s"), pt
    assert en.endswith(" in {{seconds}}s"), en
    for text in (pt, en):
        assert "válid" not in text and "valid" not in text
