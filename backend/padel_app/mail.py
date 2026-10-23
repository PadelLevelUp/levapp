import smtplib

from flask import current_app
from flask_mail import Connection, Mail

# PAD-734: Flask-Mail 0.9.1 opens SMTP with no timeout, so a mail server that accepts and never
# answers held the caller for as long as the socket lived. The timeout goes to the constructor,
# because smtplib connects (and reads the banner) inside it.
DEFAULT_TIMEOUT_SECONDS = 10


class _TimeoutConnection(Connection):
    def configure_host(self):
        timeout = current_app.config.get("MAIL_TIMEOUT") or DEFAULT_TIMEOUT_SECONDS
        if self.mail.use_ssl:
            host = smtplib.SMTP_SSL(self.mail.server, self.mail.port, timeout=timeout)
        else:
            host = smtplib.SMTP(self.mail.server, self.mail.port, timeout=timeout)
        host.set_debuglevel(int(self.mail.debug))
        if self.mail.use_tls:
            host.starttls()
        if self.mail.username and self.mail.password:
            host.login(self.mail.username, self.mail.password)
        return host


class _Mail(Mail):
    def connect(self):
        app = getattr(self, "app", None) or current_app
        try:
            return _TimeoutConnection(app.extensions["mail"])
        except KeyError:
            raise RuntimeError("The current application was not configured with Flask-Mail")


mail = _Mail()
