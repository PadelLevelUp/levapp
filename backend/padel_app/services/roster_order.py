"""The one order a class roster is listed in (classes.instance-enrollment rule 12, D163).

By the account name the roster shows (`users.name`), ignoring case and accents, then by
player id. The server sets it so every client renders the same order, and nothing done
to a row (an attendance save, an answer) can move it: before this the roster came back in
whatever order the database returned, which a save could change (B-233).
"""
import unicodedata


def _fold(name):
    decomposed = unicodedata.normalize("NFKD", name or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def roster_sort_key(row):
    """Sort key for a roster row: a Presence or a series-roster association."""
    return (_fold(row.player.user.name), row.player_id)


def in_roster_order(rows):
    return sorted(rows, key=roster_sort_key)
