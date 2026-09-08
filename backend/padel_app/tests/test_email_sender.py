"""The From address is not the SMTP login.

Google Workspace lets one seat send as its aliases, so the app authenticates as
a real mailbox (MAIL_USERNAME, admin@levapp.app) and sends as a no-reply alias
(MAIL_DEFAULT_SENDER, noreply@levapp.app). Before this split the From address
was hardwired to the login, so mail went out from a personal Gmail.
"""

from padel_app.tools import email_tools


def test_sender_prefers_the_configured_default(app):
    with app.app_context():
        app.config["MAIL_USERNAME"] = "admin@levapp.app"
        app.config["MAIL_DEFAULT_SENDER"] = "noreply@levapp.app"

        assert email_tools._sender() == "noreply@levapp.app"


def test_sender_falls_back_to_the_login(app):
    """Environments that set only MAIL_USERNAME keep working unchanged."""
    with app.app_context():
        app.config["MAIL_USERNAME"] = "admin@levapp.app"
        app.config["MAIL_DEFAULT_SENDER"] = ""

        assert email_tools._sender() == "admin@levapp.app"


def test_no_sender_at_all_is_still_an_error(app):
    with app.app_context():
        app.config["MAIL_USERNAME"] = ""
        app.config["MAIL_DEFAULT_SENDER"] = ""

        assert email_tools._sender() == ""
