"""settings.admin-editor rule 3 (PAD-267): the secret columns the generic editor
never returns and never writes.

Keyed by table name. `test_pad267_admin_editor.py` walks every table and fails
when a column that looks like a secret (token / password / secret / hash /
subscription) is neither listed here nor explicitly cleared in NOT_SECRET, so a
new secret cannot be served by the editor by accident.
"""

REDACTED_COLUMNS = {
    "users": frozenset({
        "password",
        "generated_code",
        "email_verification_code_hash",
        "password_reset_code_hash",  # PAD-139
    }),
    "device_tokens": frozenset({"token"}),
    "push_subscriptions": frozenset({"subscription_json"}),
    "coach_invitations": frozenset({"token"}),
    "player_invitations": frozenset({"token"}),
    "coach_join_tokens": frozenset({"token"}),
}

#: Columns whose names look like secrets but are not. Add a (table, column) pair
#: here, with a reason, rather than weakening the guard.
NOT_SECRET = frozenset({
    # PAD-139 recovery bookkeeping: they match only on "password" and hold a
    # timestamp or a counter, like the email_verification_* siblings the editor
    # already serves. The code itself is redacted above.
    ("users", "password_reset_expires_at"),
    ("users", "password_reset_sent_at"),
    ("users", "password_reset_attempts"),
})


def redacted_columns(model_or_instance) -> frozenset:
    """The redacted column names of a model class or instance (or table name)."""
    table = getattr(model_or_instance, "__tablename__", model_or_instance)
    return REDACTED_COLUMNS.get(table, frozenset())


def strip_redacted(model_or_instance, values) -> dict:
    """``values`` without any redacted key: a secret is never written through the editor."""
    hidden = redacted_columns(model_or_instance)
    return {key: value for key, value in (values or {}).items() if key not in hidden}
