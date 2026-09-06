from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    JSON,
    event,
    or_,
)
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Message(db.Model, model.Model):
    __tablename__ = "messages"
    __table_args__ = (
        # PAD-204: the two access paths messaging takes into this table. The
        # conversation list and the thread view both read a single
        # conversation's messages newest-first; the unread query and the sender
        # joins read by sender. Neither had an index, so both were sequential
        # scans over every message in the database
        # (messaging.conversations Entities).
        Index("ix_messages_conversation_id_sent_at", "conversation_id", "sent_at"),
        Index("ix_messages_sender_id", "sender_id"),
        {"extend_existing": True},
    )

    page_title = "Message"
    model_name = "Message"

    id = Column(Integer, primary_key=True)
    text = Column(String, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships with User
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    sender = relationship(
        "User", foreign_keys=[sender_id], back_populates="messages_sent"
    )

    # Attachment
    attachment_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    attachment = relationship("Image", foreign_keys=[attachment_id])
    
    conversation_id = Column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    conversation = relationship(
        "Conversation",
        back_populates="messages",
        # PAD-204: `conversations.last_message_id` points back at this table, so
        # there are now two foreign key paths between messages and conversations
        # and neither side can guess which one this relationship means.
        foreign_keys=[conversation_id],
    )

    # Reply-to (self-referential)
    reply_to_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    reply_to    = relationship("Message", remote_side="Message.id", foreign_keys="Message.reply_to_id")

    edited     = Column(Boolean, default=False, nullable=False, server_default="false")
    is_deleted = Column(Boolean, default=False, nullable=False, server_default="false")

    # Notification / system messages
    message_type = Column(String, default="text", nullable=False, server_default="text")
    msg_metadata = Column(JSON, nullable=True)

    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")

    @property
    def attachment_url(self):
        return self.attachment.url() if self.attachment else None

    def display_all_info(self):
        searchable = {"field": "text", "label": "Message Text"}
        fields = [
            {"field": "sent_at", "label": "Sent At"},
            {"field": "sender_id", "label": "Sender"},
        ]
        return searchable, fields

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                **kwargs,
            )

        form = Form()

        picture_block = Block(
            "picture_block",
            fields=[get_field("attachment_id", "Attachment Image", "Picture")],
        )
        form.add_block(picture_block)

        info_block = Block(
            "info_block",
            fields=[
                get_field("text", "Text", "Text"),
                get_field("sent_at", "Sent At", "DateTime"),
                get_field("sender", "Sender", "ManyToOne", related_model="User"),
                get_field("conversation", "Conversation", "ManyToOne", related_model="Conversation"),
            ],
        )
        form.add_block(info_block)

        return form


@event.listens_for(Message, "after_insert")
def _bump_conversation_last_message(mapper, connection, target):
    """Keep `conversations.last_message_*` pointed at the newest message.

    PAD-204 / messaging.conversations rule 11. Four places in this codebase
    insert a `messages` row — `create_message_service`, two writers in
    `notification_service`, and `replacement_approval_service` — and a fifth is
    always one ticket away. A helper called from each of them is four edits and
    a standing invitation to forget the fifth, so the pointer is maintained
    here, at the single choke point every insert has to pass through. Rule 11's
    "no path exempt" is then structural rather than a convention.

    Deliberately a Core UPDATE on the handler's `connection`, not an ORM write:
    an `after_insert` handler runs inside the flush, and touching the session
    from there is undefined behaviour. The connection also puts the update in
    the same transaction as the INSERT — the other half of rule 11 — for one
    cheap statement against a primary key.

    The `last_message_at IS NULL OR <= sent_at` guard is what stops a back-dated
    insert (a backfill, a replayed reminder job) from rewinding a live thread.
    """
    if target.conversation_id is None or target.sent_at is None:
        return

    from padel_app.models.conversations import Conversation

    conversations = Conversation.__table__
    connection.execute(
        conversations.update()
        .where(conversations.c.id == target.conversation_id)
        .where(
            or_(
                conversations.c.last_message_at.is_(None),
                conversations.c.last_message_at <= target.sent_at,
            )
        )
        .values(last_message_at=target.sent_at, last_message_id=target.id)
    )
