"""PAD-596 / B-521 — notifications.invitations rule 10: a yes is ONE commit, and nothing is
committed after it on the accept path.

Before: `coach_respond_to_notification` followed `enrol()`'s commit with `event.save()` and
`vacancy.save()` — two empty commits; `respond_to_notification` followed it with one. The coach's
count is pinned at 1 in test_pad563; the student's path commits again later for its confirm
message and read-mark, so what is pinned here is the shape: the real commit comes right after the
close, the bubble edits ride on it, and the next commit is the confirm message's, not an empty one.
"""
from datetime import timedelta
from unittest.mock import patch

from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES
from padel_app.tests.test_pad499_publish_after_commit import _two_invited, trail  # noqa: F401 — fixture


def test_the_students_yes_commits_once_before_its_confirm_message(app, monkeypatch, trail):
    """OLD-RED (count): the trailing `event.save()` added an empty commit between the enrolment's
    commit and the confirm message's."""
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[1]):
        instance_id, coach_id, a, b, events = _two_invited(app)
        winner_message_id, other_message_id = events[a].message_id, events[b].message_id
        trail.clear()
        assert ns.respond_to_notification(
            events[a].id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1)
        ) == {"action": "confirmed"}

    i_commit = trail.index("commit")
    assert trail[:i_commit] == ["close"], f"nothing is published before the commit that records the yes: {trail}"
    first_batch = trail[i_commit + 1: trail.index("commit", i_commit + 1)]
    assert f"publish:message_edited:{winner_message_id}" in first_batch, trail
    assert f"publish:message_edited:{other_message_id}" in first_batch, trail
    # Measured on 2026-10-10 (2×2, old vs new code): 7 commits before, 6 after — the one removed is
    # the empty `event.save()` that sat between the enrolment's commit and the confirm message's
    # (conversation + message, then the retired bubble, then the read-mark). The downstream commits
    # are the confirm message's own and out of PAD-596's scope; the count pins that no empty one
    # comes back on the accept path.
    assert trail.count("commit") == 6, trail
