from flask_mail import Message
import os

from ..mail import mail

MAIL_USERNAME = os.environ.get("MAIL_USERNAME")


def send_email(subject, recipients, body=None, html=None):
    msg = Message(subject, sender=MAIL_USERNAME, recipients=recipients)
    if body:
        msg.body = body
    if html:
        msg.html = html
    if not (body or html):
        raise ValueError("Either body or html must be provided")
    mail.send(msg)
    return "Sent"
