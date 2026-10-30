"""The one stored form of an email address (auth.password-recovery rule 12, PAD-781).

Every lookup by email compares ``lower(users.email)`` with a trimmed, lower-cased value, so a
stored address with a space around it never matches: recovery answered its silent 200 and sent
nothing, and login by email failed the same way. Every writer stores the address through this.
"""


def normalise_email(raw):
    """The address trimmed and lower-cased, or None when there is none. Never validates: a
    writer that must refuse an invalid address checks the result itself."""
    if not isinstance(raw, str):
        return None
    return raw.strip().lower() or None
