from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String

from padel_app.sql_db import db


class AppSetting(db.Model):
    """One operator-level setting per row, keyed by name (PAD-238 item 3, shipped by
    PAD-279; auth.coach-approval rule 9). The first key is
    ``coach_approval_required``. A row is written only when a superadmin flips
    the setting; with no row the process falls back to its env flag, so an
    environment that never touched a setting behaves as before.

    Shaped like ``DigitalConsentAge``: no editor mixin, read on the request
    that needs it, changed with one UPDATE and no deploy. ``value`` is JSON so
    a later setting can be a number or a list without a new column.
    """

    __tablename__ = "app_settings"
    # Every model in this package carries extend_existing (models/MODELS.md
    # skeleton; DigitalConsentAge too): the test app factory imports the models
    # package more than once per process, and a second class definition on the
    # same MetaData would otherwise raise. Not a sign of a duplicate table.
    __table_args__ = {"extend_existing": True}

    key = Column(String(64), primary_key=True)
    value = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
