"""PAD-659 (calendar.event-detail rule 24): tell the class's coach that a presence moved.

Every write that moves a presence — the student's reminder answer, a cancellation or proactive
decline, the coach's own mark or clear — queues one `presence_changed` live event for the
class's coach, so their open class regroups its participants without a reload. A student never
receives it: nothing in their own view depends on another student's presence.

Queue it BEFORE the write's `save()`: `save()` commits when no unit of work is open, and an
action queued after that commit would wait for the next one (`tools/after_commit`).
"""
from padel_app.tools.after_commit import on_commit


def publish_presence_changed(instance, player_id) -> None:
    from padel_app import realtime

    recipients = sorted({
        rel.coach.user_id
        for rel in (instance.coaches_relations or [])
        if rel.coach is not None and rel.coach.user_id
    })
    if not recipients:
        return
    event = {
        "type": "presence_changed",
        "payload": {"lessonInstanceId": instance.id, "playerId": int(player_id)},
    }
    on_commit(lambda: realtime.publish(event, recipients))
