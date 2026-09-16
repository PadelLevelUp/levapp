from sqlalchemy import Column, Integer, String

from padel_app.sql_db import db


class DigitalConsentAge(db.Model):
    """auth.parental-consent rule 1 (PAD-198): the age of digital consent per
    country (ISO 3166-1 alpha-2). Seeded by the migration and read on every
    sign-up, so an operator changes an age with one UPDATE and no deploy.
    A country with no row uses `DIGITAL_CONSENT_DEFAULT_AGE`."""

    __tablename__ = "digital_consent_ages"
    __table_args__ = {"extend_existing": True}

    country = Column(String(2), primary_key=True)
    age = Column(Integer, nullable=False)
