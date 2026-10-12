from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model


class MessageReport(db.Model, model.Model):
    __tablename__ = "message_reports"
    model_name = "MessageReport"
    __table_args__ = (
        Index("ix_message_reports_status", "status"),
        {"extend_existing": True},
    )

    id          = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_id  = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    reason      = Column(String, nullable=True)
    # admin.moderation rule 1 (PAD-631): the review state.
    status      = Column(String(16), nullable=False, default="open", server_default="open")
    #: "dismissed" | "message_deleted" | "author_disabled"
    outcome     = Column(String(24), nullable=True)
    closed_at   = Column(DateTime, nullable=True)
    #: The staff email that closed it.
    closed_by   = Column(String(255), nullable=True)
    # block-and-report rule 4a (PAD-639): the reported text, copied when the report is filed so
    # erasing the message (messaging.messages rule 3) never erases the evidence.
    message_text = Column(String, nullable=True)

    reporter = relationship("User", foreign_keys=[reporter_id])
    message  = relationship("Message", foreign_keys=[message_id])
