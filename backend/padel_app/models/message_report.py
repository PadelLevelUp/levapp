from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model


class MessageReport(db.Model, model.Model):
    __tablename__ = "message_reports"
    model_name = "MessageReport"
    __table_args__ = {"extend_existing": True}

    id          = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_id  = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    reason      = Column(String, nullable=True)
    # block-and-report rule 4a (PAD-639): the reported text, copied when the report is filed so
    # erasing the message (messaging.messages rule 3) never erases the evidence.
    message_text = Column(String, nullable=True)

    reporter = relationship("User", foreign_keys=[reporter_id])
    message  = relationship("Message", foreign_keys=[message_id])
