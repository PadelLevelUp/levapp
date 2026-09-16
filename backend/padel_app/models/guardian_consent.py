from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
# Aliased: the table has a `relationship` column (the guardian's relation to the
# minor), which would otherwise shadow SQLAlchemy's helper inside the class.
from sqlalchemy.orm import relationship as orm_relationship

from padel_app.sql_db import db


class GuardianConsent(db.Model):
    """auth.parental-consent (PAD-198): one row per minor who signed up on
    their own. It holds the consent link while pending and, once the guardian
    answers, is the audit record the privacy policy promises (who, relation,
    the minor's details as confirmed, when, terms version). Tokens are stored
    only as SHA-256 hashes."""

    __tablename__ = "guardian_consents"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    guardian_email = Column(String(120), nullable=False)
    guardian_name = Column(String(120), nullable=True)
    relationship = Column(String(32), nullable=True)
    minor_snapshot = Column(Text, nullable=True)
    terms_version = Column(String(32), nullable=True)
    consent_token_hash = Column(String(64), nullable=True, index=True)
    consent_expires_at = Column(DateTime, nullable=True)
    consent_sent_at = Column(DateTime, nullable=True)
    requested_at = Column(DateTime, nullable=False)
    consented_at = Column(DateTime, nullable=True)
    consent_ip = Column(String(64), nullable=True)
    revoke_token_hash = Column(String(64), nullable=True, index=True)
    revoked_at = Column(DateTime, nullable=True)

    user = orm_relationship("User")
