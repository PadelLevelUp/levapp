"""admin.moderation rule 8 (PAD-631): a new message report emails the admin.

Its own module, so the messaging service (which stores the report) does not import the staff
console's services.
"""
from datetime import timedelta

from flask import current_app
from sqlalchemy import and_, or_

from padel_app.models import MessageReport
from padel_app.sql_db import db

# admin.moderation rule 8: a new report emails ADMIN_NOTIFY_EMAIL — once per burst, so a spam wave
# is one email, and never the message, the reason or a name (the console holds those).
REPORT_EMAIL_QUIET = timedelta(minutes=15)


def notify_admin_of_report(report):
    """Best effort: never raises, so a mail outage can never fail the person reporting.

    Call it after the report is committed. The send is synchronous, like the coach-approval mail.
    """
    try:
        to = current_app.config.get("ADMIN_NOTIFY_EMAIL")
        if not to:
            return
        # The burst rule reads the table, so it holds across workers: no other report in the
        # quiet window before this one. A tie on created_at goes to the lower id, so two reports
        # at the same instant still send exactly one email.
        t = report.created_at
        earlier = (
            MessageReport.query.filter(MessageReport.created_at >= t - REPORT_EMAIL_QUIET)
            .filter(or_(MessageReport.created_at < t,
                        and_(MessageReport.created_at == t, MessageReport.id < report.id)))
            .count()
        )
        if earlier:
            return
        open_count = MessageReport.query.filter(MessageReport.status == "open").count()
        base = (current_app.config.get("ADMIN_CONSOLE_URL") or "").rstrip("/")
        # Like the coach-approval mail: a link only when the console's address is configured.
        where = f"Review them in the staff console: {base}/reports" if base else "Review them in the staff console."
        body = (
            f"A message was reported on LevApp. Open reports: {open_count}.\n\n"
            f"{where}\n\n"
            "Further reports in the next 15 minutes will not send another email."
        )
        from padel_app.tools.email_tools import send_email

        send_email("[LevApp] New message report", [to], body=body)
    except Exception as exc:  # noqa: BLE001 — never fail the report on mail
        db.session.rollback()  # a failed count leaves the session unusable; the report is committed
        # B-254: the exception class only; an SMTP refusal names the recipient.
        current_app.logger.warning("report mail failed: %s", type(exc).__name__)
