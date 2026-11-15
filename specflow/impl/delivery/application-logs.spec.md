---
id: delivery.application-logs
status: implemented
depends_on: []
serves: [P-DELIVERY-3]
governed_by: []
---

# delivery.application-logs

> Written 2026-11-09 during the spec port, from the tests of B-254.

### Intent
The server's logs say that something failed and what kind of failure it was, without holding the
person's address, a token, a push endpoint or the text involved.

### Rules
1. **A failure is logged by kind.** When sending a mail, reading a model's answer or sending a push
   fails, the server logs one warning that names the kind of failure: the exception's class, a
   count, or an internal id. It is never silent.
2. **The log line never holds what the failure was about.** No e-mail address, verification or
   reset token, push endpoint or device token, and no text from a message or from a model's answer
   appears in it.
3. **The route keeps its own answer.** A failed mail does not change what the route answers, where
   that route's own spec says the request succeeds without it.

### Acceptance Criteria

#### DELIVERY-APPLICATION-LOGS-1: A failed send, parse or push is logged by its kind, never with what it was about (rules 1, 2, 3)
- **Given** a mail provider, a model answer and a push provider that each fail with an error whose text holds an address, a token or content
- **When** a verification mail, a sign-up, a password recovery, an allow-list check, a model answer and a push each hit that failure
- **Then** each logs a warning that names the exception's class or a count
- **And** no log record holds the address, the token, the endpoint or the content
- **And** sign-up still answers 201 and the recovery request 200, while the send of a verification code answers 503
test: `backend/padel_app/tests/test_b254_no_addresses_in_logs.py` › `test_email_verification_send_logs_no_address` (+14 more)

### Open questions

- **Rule 2 is wider than the tests.** Four log lines still print an exception's own text, with no test: `request_alert_service.py:124` and `:132`, `coach_approval_service.py:240` and `helpers/llm.py:110`. Recommendation: log the class name there too, then keep rule 2 as written.
