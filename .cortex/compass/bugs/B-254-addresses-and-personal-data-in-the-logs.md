---
id: B-254
title: "A failing send wrote the recipient's email address to the logs; so did the allowlist guard and the exception it raises"
type: missing-criterion
severity: medium
status: resolved
resolved: 2026-10-02T13:10:20Z
affects:
  - backend/padel_app/services/email_verification_service.py
  - backend/padel_app/services/password_recovery_service.py
  - backend/padel_app/services/request_alert_service.py
  - backend/padel_app/services/coach_approval_service.py
  - backend/padel_app/services/club_service.py
  - backend/padel_app/tools/email_tools.py
  - backend/padel_app/helpers/llm.py
  - backend/padel_app/utils/expo_push.py
proposed_fix: "Log the user id (or a recipient count) and the exception CLASS, never an address or the exception text; MailRecipientNotAllowed's message becomes a count; the raw LLM output and whole Expo tokens leave the logs."
opened: 2026-10-02T13:10:20Z
---

# B-254: addresses and personal data in the logs

**Source:** a craft note on #500 (PAD-477) by the coordinator. My new warning in `club_service.py` logged
the exception text. The sweep that followed found the older, larger leak (2026-10-02, Session-B).

**What happened (staging `e88f29a5e`):**
- Five mail paths logged the recipient's address outright when a send failed, and the exception text
  as well:
  - `email_verification_service.py:115` and `:147`;
  - `password_recovery_service.py:123`;
  - `request_alert_service.py:129`;
  - `coach_approval_service.py:143` (the whole `recipients` list).
- Two more logged the exception text of a path that mails: `coach_approval_service.py:162` and
  `club_service.py:196`.
- **The carrier behind most of them:** `email_tools.MailRecipientNotAllowed` was raised with
  `f"no allowed recipient among {list(recipients)}"`, so every caller logging the exception wrote the
  addresses. An SMTP refusal does the same, because it names the recipient.
- `email_tools.py:100`, the `MAIL_ALLOWED_RECIPIENTS` guard, logged the dropped addresses as a list.
- `helpers/llm.py:119` logged up to 500 characters of the raw LLM output on a JSON error. In the AI
  roster and evaluation import that is players' names and coaching notes.
- `utils/expo_push.py:118` and `:125` logged whole Expo device tokens.

**Root cause:** no rule says what a log line may carry. Each site logged what was useful at the time.
This is a missing criterion across the mail paths rather than a single wrong line.

**Sweep method:** a `git grep` of every `logger`/`logging` call outside the tests. Then all 37 multi-line
calls were read argument by argument (a haiku agent; every hit re-read by Session-B).

**Looked at and left as they are** (coordinator, 2026-10-02): exception text on non-mail paths. These
are `scheduler.py` (244, 318, 333, 345, 377, 516, 957), `push_sender.py:101`, `push_notifications.py`
(88, 91), `expo_push.py` (96, 102), `llm.py:105`, `ai_service.py:927`, the `logger.exception` calls in
`lesson_service.py` (133, 1428) and `notification_service.py:2130`, `coach_approval_service.py:199`
and `request_alert_service.py` (115, 123). They carry database, HTTP or LLM error text, which is not
address-bearing by construction. Those messages are what make a production failure diagnosable.
`hubspot_sync` was already clean (class names only).

**Exposure** (stated, not guessed):
- Production logs are the `padelapp` container's docker logs (json-file driver, no `--log-*`
  options). They hold warnings and errors only; Gunicorn writes no access log.
- Every deploy runs `docker stop padelapp && docker rm padelapp` and then a fresh `docker run`
  (`.github/workflows/deploy-prod.yaml:179-181`), so the log goes with the container.
- Therefore an address logged before this fix exists only in the CURRENT container's log on the VM,
  back to the last deploy. Staging deploys the same way.
- Host nginx's access log is separate and holds request lines, not these warnings.

### Change Plan

1. The nine mail-path sites (the eight above plus `:162`): the user id, or a recipient count, and
   `type(exc).__name__`. `MailRecipientNotAllowed`'s message becomes a count.
2. `llm.py:119`: the output's length and the parse error's class, not the content.
3. `expo_push.py:118` and `:125`: a short suffix of the token (enough to tell two devices apart),
   never the whole token; check what the receipt carries.
4. Tests: one per site. A failing send must leave a warning (the logger is alive) and no record
   containing the address.

### Resolution

- Commit 1: the nine mail-path sites log the user id, or a recipient count, and the exception class.
  `MailRecipientNotAllowed`'s message is a count.
- Commit 2: `llm.py` logs the output's length and the parse error's class. `expo_push.py` logs
  `…` plus the token's last 6 characters (`_token_tail`), and for an error receipt its status and
  Expo's error code. Not the receipt's message, which quotes the whole token.
- Tests: `test_b254_no_addresses_in_logs.py`, 12. All were red first, with the leak shown verbatim.
  Each asserts the warning was logged, so a silenced logger fails the test, and that the address,
  names or token are absent.
