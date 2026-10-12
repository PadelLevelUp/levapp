"""auth.social-sign-in (PAD-618): a LevApp account's link to a Google or Apple account."""
from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app import model
from padel_app.sql_db import db


class UserIdentity(db.Model, model.Model):
    __tablename__ = "user_identities"
    page_title = "User Identities"
    model_name = "UserIdentity"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_user_identity_provider_subject"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    #: "google" or "apple".
    provider = Column(String(16), nullable=False)
    #: The provider's stable account id (the ID token's `sub`).
    subject = Column(String(255), nullable=False)
    #: The email the provider gave when the link was made (kept for support; not used to sign in).
    email = Column(String(255), nullable=True)

    user = relationship("User")
