from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime

from padel_app.sql_db import db


class TokenBlocklist(db.Model):
    __tablename__ = "token_blocklist"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True)
    jti = Column(String(36), nullable=False, unique=True, index=True)
    created_at = Column(
        DateTime,
        nullable=False,
        # PAD-273: naive UTC like every other column; a timezone-aware value
        # was being written into this naive column.
        default=datetime.utcnow,
    )
