"""Invitation and join tokens are stored only as a SHA-256 hash (PAD-269, audit M11).

players.join-token, players.invite-completion and clubs.coach-invitation: the link
carries a `secrets.token_urlsafe(32)` token (256 random bits), and the database keeps
`token_hash` only, so a leaked table or an admin screen hands out no live links. A plain
SHA-256 is enough for 256-bit random secrets: nothing can be guessed to match it.
"""
import hashlib


def hash_token(token):
    """Hex SHA-256 of a link token, the only form the database stores."""
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


class HashedTokenMixin:
    """`token` is write-only on the model: setting it (in the constructor or later) stores
    `token_hash`. The plain token stays on this instance for the request that minted it,
    so the creation response can still carry the link; it is never persisted, and a row
    loaded from the database has `token` None."""

    @property
    def token(self):
        return self.__dict__.get("_plain_token")

    @token.setter
    def token(self, value):
        self.__dict__["_plain_token"] = value
        self.token_hash = hash_token(value)

    @classmethod
    def by_token(cls, token):
        """The row a link token maps to, or None."""
        if not token:
            return None
        return cls.query.filter_by(token_hash=hash_token(token)).first()
