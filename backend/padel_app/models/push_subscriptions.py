# Audit findings (Phase 1):
# - Message creation flow is /api/app/message -> create_message_service() in services/messaging_service.py.
# - SSE subscriptions are tracked globally in padel_app/realtime.py as an in-memory list of queues,
#   without user-scoped connection tracking.
# - ORM/DB stack is Flask-SQLAlchemy + SQLAlchemy models with Alembic migrations.
# - API auth uses flask-jwt-extended (@jwt_required + get_jwt_identity).
# - Env loading in development happens in backend/app.py via load_dotenv(".env.local.dev").
import json

from sqlalchemy import Column, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship, validates

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


#: auth.push-subscription rule 10 (PAD-753): a longer endpoint does not fit the unique index.
MAX_ENDPOINT_BYTES = 2048
#: Rule 1: the most browsers one user keeps (the spec's const:WEB_PUSH_SUBSCRIPTIONS_PER_USER).
WEB_PUSH_SUBSCRIPTIONS_PER_USER = 5


def endpoint_of(subscription) -> str | None:
    """The push-service URL of a subscription (a dict, or its stored JSON); None when it has no usable one."""
    if isinstance(subscription, str):
        try:
            subscription = json.loads(subscription)
        except ValueError:
            return None
    endpoint = subscription.get("endpoint") if isinstance(subscription, dict) else None
    if not isinstance(endpoint, str) or not endpoint or len(endpoint.encode("utf-8", "replace")) > MAX_ENDPOINT_BYTES:
        return None
    return endpoint


class PushSubscription(db.Model, model.Model):
    __tablename__ = "push_subscriptions"
    __table_args__ = {"extend_existing": True}
    model_name = "PushSubscription"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One row per browser (PAD-753). Nullable for one release: the previous one inserts without it
    # (auth.push-subscription rule 11). A capability (B-254): never logged, never exported.
    endpoint = Column(Text, nullable=True, unique=True, index=True)
    subscription_json = Column(Text, nullable=False)

    user = relationship("User")

    @validates("subscription_json")
    def _take_the_endpoint(self, _key, value):
        self.endpoint = endpoint_of(value)
        return value

    @property
    def name(self):
        return f"Push subscription for user {self.user_id}"

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                required=required,
            )

        form = Form()
        info_block = Block(
            "info_block",
            fields=[
                get_field("user", "User", "ManyToOne", required=True),
                get_field("subscription_json", "Subscription JSON", "Text", required=True),
            ],
        )
        form.add_block(info_block)
        return form


def evict_beyond_cap(user_ids, keep_id=None) -> int:
    """Rule 1: of these users' rows together (one user, or the two of a claim merge), delete those beyond
    the cap, least recently updated first; `keep_id` is never one of them. Answers how many went."""
    rows = PushSubscription.query.filter(PushSubscription.user_id.in_(user_ids)).all()
    rows.sort(key=lambda r: (r.id == keep_id, r.updated_at is not None, r.updated_at, r.id), reverse=True)
    evicted = rows[WEB_PUSH_SUBSCRIPTIONS_PER_USER:]
    for row in evicted:
        db.session.delete(row)
    db.session.flush()
    return len(evicted)
