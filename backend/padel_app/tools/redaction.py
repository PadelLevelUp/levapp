"""The secret columns a model's edit form never pre-fills (PAD-267, kept by PAD-550).

Keyed by table name. `Model.get_edit_form` blanks these so a stored hash or
token is never read back out through a form the services build.
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
    # PAD-269: these tables keep only the link token's SHA-256; the hash is still never served.
    "coach_invitations": frozenset({"token_hash"}),
    "player_invitations": frozenset({"token_hash"}),
    "coach_join_tokens": frozenset({"token_hash"}),
}


def redacted_columns(model_or_instance) -> frozenset:
    """The redacted column names of a model class or instance (or table name)."""
    table = getattr(model_or_instance, "__tablename__", model_or_instance)
    return REDACTED_COLUMNS.get(table, frozenset())
