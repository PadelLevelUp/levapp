"""PAD-713 (messaging.push-notifications rule 14): the push that announces a system message to a
student is titled in the student's own language, the web push and the iOS push alike.

Before PAD-713 both said "New message" in English to everyone (`_push_message`, the one writer of
this payload, R-029), so a Portuguese student's lock screen read English first.
"""
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_native_push import _create_user


@pytest.mark.parametrize("language,title", [("pt", "Nova mensagem"), ("en", "New message")])
def test_the_web_and_ios_push_titles_speak_the_students_language(app, language, title):
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        coach = _create_user("Coach", f"pad713-coach-{language}")
        student = _create_user("Student", f"pad713-student-{language}")
        student.language = language
        db.session.commit()

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification") as mock_web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
            _send_system_message(coach.id, student.id, "Está marcado!", message_type="text")

        assert mock_web.call_args.kwargs["title"] == title
        assert mock_expo.call_args.kwargs["title"] == title
        # The body is still the message itself (rule 12): only the title changed.
        assert mock_web.call_args.kwargs["body"] == "Está marcado!"
