from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Message(db.Model, model.Model):
    __tablename__ = "messages"
    __table_args__ = {"extend_existing": True}

    page_title = "Message"
    model_name = "Message"

    id = Column(Integer, primary_key=True)
    text = Column(String, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    read_at = Column(DateTime, nullable=True)

    # Relationships with User
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    receiver_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    sender = relationship(
        "User", foreign_keys=[sender_id], back_populates="messages_sent"
    )
    receiver = relationship(
        "User", foreign_keys=[receiver_id], back_populates="messages_received"
    )

    # Attachment
    attachment_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    attachment = relationship("Image", foreign_keys=[attachment_id])

    @property
    def attachment_url(self):
        return self.attachment.url() if self.attachment else None

    def display_all_info(self):
        searchable = {"field": "text", "label": "Message Text"}
        fields = [
            {"field": "sent_at", "label": "Sent At"},
            {"field": "read_at", "label": "Read At"},
            {"field": "sender_id", "label": "Sender"},
            {"field": "receiver_id", "label": "Receiver"},
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
                get_field("read_at", "Read At", "DateTime"),
                get_field("sender_id", "Sender", "ManyToOne", relation_model="User"),
                get_field(
                    "receiver_id", "Receiver", "ManyToOne", relation_model="User"
                ),
            ],
        )
        form.add_block(info_block)

        return form
