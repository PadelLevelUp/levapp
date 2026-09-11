# Phase 5 — native push device-token storage.
# - Mirrors padel_app/models/push_subscriptions.py (the existing browser Web-Push
#   model): db.Model + model.Model mixin, created_at/updated_at come from model.Model.
# - Unlike PushSubscription (unique per user_id, one browser sub per user), a
#   DeviceToken is unique per (user, token): a user can have several device tokens
#   (multiple phones/reinstalls), and registering never takes another user's row
#   (messaging.push-notifications rule 9, PAD-269; it used to reassign it).
from sqlalchemy import Column, Index, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class DeviceToken(db.Model, model.Model):
    __tablename__ = "device_tokens"
    # PAD-220 declared what migration c5d6e7f8a9b0 made: a named UNIQUE constraint plus a
    # plain index. PAD-269's 95bfee084ad1 swaps the constraint to (user_id, token); the
    # plain index on token stays.
    __table_args__ = (
        UniqueConstraint("user_id", "token", name="uq_device_tokens_user_token"),
        Index("ix_device_tokens_token", "token"),
        {"extend_existing": True},
    )
    page_title = "Device Tokens"
    model_name = "DeviceToken"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token = Column(String(255), nullable=False)
    platform = Column(String(32), nullable=True)

    user = relationship("User")

    @property
    def name(self):
        return f"Device token for user {self.user_id} ({self.platform})"

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False, related_model=None):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                required=required,
                related_model=related_model,
            )

        form = Form()
        info_block = Block(
            "info_block",
            fields=[
                # PAD-280 (B-052): "String" is not a form field type, so the
                # editor's schema route 500'd on this model.
                get_field("user", "User", "ManyToOne", required=True, related_model="User"),
                get_field("token", "Token", "Text", required=True),
                get_field("platform", "Platform", "Text"),
            ],
        )
        form.add_block(info_block)
        return form
