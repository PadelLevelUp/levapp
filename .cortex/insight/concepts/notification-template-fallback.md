A coach's message template — reminders, cancellations, invitations — may be blank, whitespace-only, or never customised. Whatever state is stored, the read path (both the config `GET` a coach sees and the message actually delivered to a student) must resolve to a non-blank, locale-appropriate built-in default; storage itself is never rewritten to fill the gap. This subsumes both the blank-template guarantee and the PT/EN locale-correctness of the rendered message (PAD-37/38/39/100) — no notification is ever delivered empty, and none is ever delivered in the wrong language.

## Implemented by
`backend/padel_app/services/notification_service.py`
`backend/padel_app/tests/test_notification_blank_template_fallback.py`
`backend/padel_app/tests/test_notification_config.py`
`frontend/apps/web/e2e/notification-engine/blank-template-fallback.spec.ts`

## Related concepts
[[reminder-lifecycle]]
[[app-wide-i18n]]
