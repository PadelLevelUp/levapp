from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Conversation(db.Model, model.Model):
    __tablename__ = "conversations"
    __table_args__ = {"extend_existing": True}
    page_title = "Conversations"
    model_name = "Conversation"

    id = Column(Integer, primary_key=True)
    group_name = Column(String, nullable=True)
    is_group = Column(Boolean, default=False, nullable=False)
    
    participant_key =Column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )

    # PAD-204: the denormalised pointer to the newest message in the thread
    # (messaging.conversations rule 11). Before it, listing conversations meant
    # sorting `conversation.messages` in Python — the whole history of every
    # listed thread pulled into the identity map — and ordering the list by a
    # correlated `MAX(sent_at)` subquery over an unindexed column.
    #
    # Maintained by the `after_insert` listener on `Message`, so it is written
    # in the same transaction as the insert and no writer can forget it. Nothing
    # in the app should set these two by hand.
    last_message_at = Column(DateTime, nullable=True)

    # `use_alter` + a named constraint: `conversations.last_message_id` points at
    # `messages.id` while `messages.conversation_id` points back here, so the two
    # tables form a dependency cycle. Without deferring this constraint,
    # `create_all` (which is how the test suite builds its SQLite schema) cannot
    # order the CREATE TABLEs. The migration adds the real constraint separately
    # for the same reason.
    last_message_id = Column(
        Integer,
        ForeignKey(
            "messages.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_conversations_last_message_id",
        ),
        nullable=True,
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        # PAD-204: `last_message_id` above is a second foreign key between these
        # two tables, so neither side can infer the join any more. This is the
        # thread; `last_message_id` is a pointer into it and is deliberately NOT
        # given a relationship — one would need `post_update` to co-exist with
        # this delete-orphan cascade, and the service reads the pointed-at rows
        # in a single `id IN (...)` query instead.
        foreign_keys="Message.conversation_id",
    )

    participants = relationship(
        "ConversationParticipant",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    
    @property
    def name(self):
        return f"Conversation {self.id}"
    
    def last_read_by(self, user_id):
        # PAD-125: match on `user_id`, not `p.id`. `p` is a
        # ConversationParticipant, so `p.id` is the join row's primary key —
        # a different sequence from `users.id`. Comparing it against a user id
        # matched no row (every message then serialized as unread) or, worse,
        # matched another participant's row and leaked their read state.
        participant = next(
            (p for p in self.participants if p.user_id == user_id),
            None
        )
        return participant.last_read_at if participant else None
    
    @staticmethod
    def build_participant_key(participant_ids: list[int]) -> str:
        return ",".join(map(str, sorted(set(participant_ids))))

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
                get_field("group_name", "Group name", "Text"),
                get_field("is_group", "Is group", "Boolean"),
                # PAD-93: there is no `validated` column on Conversation. The
                # phantom field made `get_edit_form()` raise AttributeError
                # (it does `getattr(self, field.name)` for every field) and
                # `update_with_dict` set a stray instance attribute on create.
                # Removed.
                get_field("participant_key", "Participant key", "Text"),
            ],
        )
        form.add_block(info_block)
        
        return form
