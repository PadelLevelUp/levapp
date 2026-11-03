"""Placeholder usernames for accounts whose owner has not chosen one yet.

`users.username` is NOT NULL and UNIQUE, but a username is a login credential —
so only the person who will log in gets to pick it. Coaches create player
accounts (PAD-105) and coaches invite players (PAD-32) without ever supplying a
username; those rows carry a generated placeholder until the player activates
their own account and replaces it (see `players.invite-completion` and
`auth.activate` in the spec tree).

The placeholder is deliberately unusable as a login: nobody can guess 16 random
hex characters, and these accounts have no password hash until activation.
It is an internal detail and is never rendered in the coach-facing UI.
"""

import secrets

PLACEHOLDER_USERNAME_PREFIX = "pending-"


def is_placeholder_username(username):
    """True if `username` was generated rather than chosen by its owner."""
    return bool(username) and username.startswith(PLACEHOLDER_USERNAME_PREFIX)


def unique_placeholder_username():
    """Returns a fresh placeholder username that no user currently holds."""
    # Imported lazily: this module is pulled in by services that are themselves
    # imported while the model layer is still being assembled.
    from padel_app.models import User

    while True:
        candidate = f"{PLACEHOLDER_USERNAME_PREFIX}{secrets.token_hex(8)}"
        if User.query.filter_by(username=candidate).first() is None:
            return candidate


# PAD-799 (auth.register rule 2a): usernames are case-insensitive and stored lowercase.

def normalize_username(raw):
    """The stored form of a username someone chooses: trimmed and lowercased."""
    return (raw or "").strip().lower()


def find_user_by_username(raw):
    """The account a typed username names (auth.login rule 2a): the exact spelling first, else the
    ONE account whose username matches ignoring case, else None. Until the migration lowercases
    the stored usernames, two accounts may differ only by case; each keeps its own spelling, and a
    third spelling that matches both ignoring case names neither."""
    from padel_app.models import User
    from padel_app.sql_db import db

    if not isinstance(raw, str) or not raw.strip():
        return None
    typed = raw.strip()
    exact = User.query.filter_by(username=typed).first()
    if exact is not None:
        return exact
    matches = User.query.filter(db.func.lower(User.username) == typed.lower()).limit(2).all()
    return matches[0] if len(matches) == 1 else None


def username_taken(raw, exclude_user_id=None):
    """True when another account holds this username in any case (rule 2a's uniqueness)."""
    from padel_app.models import User
    from padel_app.sql_db import db

    query = User.query.filter(db.func.lower(User.username) == normalize_username(raw))
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first() is not None
