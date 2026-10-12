import logging
import os
import threading
import time
from datetime import timedelta

import google.auth
from google.auth.transport import requests as google_auth_requests
from google.cloud import storage
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    DateTime,
    inspect,
)
from sqlalchemy.orm import class_mapper, relationship

from .sql_db import db
from .utils.dates import utcnow_naive

GCS_BUCKET = os.environ.get("GCS_UPLOADS_BUCKET")
PUBLIC_BASE = f"https://storage.googleapis.com/{GCS_BUCKET}"

# Signed URLs are handed to clients inside API responses and then used by
# an <img> tag for as long as that payload stays on screen. Five minutes
# expired while a page was still open; an hour outlives a render without
# turning the URL into a durable capability.
SIGNED_URL_MINUTES = 60
# PAD-593: a signed URL is reused for this long, which is shorter than its own life, so a
# reused URL always has at least 10 minutes left. Within the window the same image keeps the
# same URL, which is what lets browsers and React Native's image cache hit.
SIGNED_URL_REUSE_MINUTES = 50
# A signer that failed (B-018) is not asked again for the same image for this long.
SIGNING_FAILURE_RETRY_SECONDS = 60
# Bounded: past this many keys the expired entries are swept, then the oldest go.
_SIGNED_URL_CACHE_MAX = 5000
_monotonic = time.monotonic

# object_key -> (url or None, expires_at on the _monotonic clock). Per process: each worker
# signs an image at most once per window instead of once per image per response.
_SIGNED_URL_CACHE = {}
_SIGNED_URL_CACHE_LOCK = threading.Lock()


def _reset_signed_url_cache():
    """Tests only: forget every cached signing."""
    with _SIGNED_URL_CACHE_LOCK:
        _SIGNED_URL_CACHE.clear()


def _cached_signing(object_key, sign):
    """`sign()`'s result for this key, reused until it expires (a failure is cached as None).

    Keyed by object key alone, so it is only valid for the default signing that
    `Image.url()` asks for (`SIGNED_URL_MINUTES`, GET). A caller that needs another
    lifetime or method calls `Image.signed_url` directly, uncached.
    """
    now = _monotonic()
    with _SIGNED_URL_CACHE_LOCK:
        hit = _SIGNED_URL_CACHE.get(object_key)
        if hit is not None and hit[1] > now:
            return hit[0]
    try:
        url = sign()
        expires_at = now + SIGNED_URL_REUSE_MINUTES * 60
    except Exception as exc:  # noqa: BLE001 — any signer failure degrades (B-018)
        logging.getLogger(__name__).warning("could not sign image %s: %s", object_key, exc)
        url = None
        expires_at = now + SIGNING_FAILURE_RETRY_SECONDS
    with _SIGNED_URL_CACHE_LOCK:
        # Re-insert so dict order is by last write; at the cap the oldest write goes first.
        _SIGNED_URL_CACHE.pop(object_key, None)
        while len(_SIGNED_URL_CACHE) >= _SIGNED_URL_CACHE_MAX:
            del _SIGNED_URL_CACHE[next(iter(_SIGNED_URL_CACHE))]
        _SIGNED_URL_CACHE[object_key] = (url, expires_at)
    return url


# One storage client per process (B-018). `storage.Client()` resolves
# credentials against the metadata server every time it is built; doing that
# once per avatar on a page of real users is what made staging crawl.
_STORAGE_CLIENT = None


def _storage_client():
    global _STORAGE_CLIENT
    if _STORAGE_CLIENT is None:
        _STORAGE_CLIENT = storage.Client()
    return _STORAGE_CLIENT


def _reset_storage_client():
    """Tests only: forget the cached client."""
    global _STORAGE_CLIENT
    _STORAGE_CLIENT = None


_SIGNING_CREDENTIALS = None


def _signing_credentials():
    """Ambient credentials, refreshed only when the token has actually expired.

    Cached because every image URL in a response would otherwise re-resolve ADC
    and re-mint a token.
    """
    global _SIGNING_CREDENTIALS
    if _SIGNING_CREDENTIALS is None:
        _SIGNING_CREDENTIALS, _ = google.auth.default()
    if not _SIGNING_CREDENTIALS.valid:
        _SIGNING_CREDENTIALS.refresh(google_auth_requests.Request())
    return _SIGNING_CREDENTIALS


def _commit_or_flush():
    """PAD-272: commit, unless a unit of work is open on this thread — then
    flush, and the unit commits once at its end (tools/unit_of_work.py)."""
    from padel_app.tools.unit_of_work import commit_or_flush

    commit_or_flush()


class NotNullableFieldError(ValueError):
    """`update_with_dict(write_none=True)` was given None for something that cannot be NULL.

    Raised BEFORE anything is written, with every such key in `fields` (in the order the
    values came), so a route can answer 400 naming them instead of dying on an
    IntegrityError at flush (PAD-367).
    """

    def __init__(self, fields):
        self.fields = list(fields)
        super().__init__(f"cannot be empty: {', '.join(self.fields)}")


class Model:

    _name = None
    _description = None
    __tablename__ = None

    created_at = Column(DateTime, default=lambda: utcnow_naive())
    # PAD-273 (audit M13): bumped on EVERY ORM update, not only through save();
    # most services commit directly. UTC like everything else (R-023). Late-bound (PAD-405,
    # R-054) so a pinned clock reaches every model that inherits these columns.
    updated_at = Column(DateTime, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive())

    def __repr__(self):
        try:
            return f"{self.model_name}: {self.name}"
        except ValueError:
            ValueError(
                "This model has no defined name, choose another way of representing"
            )

    def __str__(self):
        try:
            return f"{self.model_name}: {self.name}"
        except ValueError:
            ValueError(
                "This model has no defined name, choose another way of representing"
            )

    def create(self):
        if hasattr(self, "_sa_instance_state"):
            self._sa_instance_state.key = None
        if inspect(self).key is not None:
            inspect(self).key = None
        db.session.add(self)
        _commit_or_flush()  # PAD-272: a flush while a unit of work is open
        return True

    def add_to_session(self):
        db.session.add(self)
        return True

    def delete(self):
        db.session.delete(self)
        _commit_or_flush()  # PAD-272: a flush while a unit of work is open
        return True

    def save(self):
        # PAD-273: this used to stamp LOCAL time (datetime.now()) into a column
        # everything else fills with UTC.
        self.updated_at = utcnow_naive()
        _commit_or_flush()  # PAD-272: a flush while a unit of work is open
        return True

    def flush(self):
        db.session.flush([self])
        return True

    def update_with_dict(
        self,
        values: dict,
        *,
        write_none: bool = False,
        _replace_collections: set[str] = frozenset(),
    ) -> bool:
        """
        Update this instance from a values dict.

        - Relationships are only updated when the incoming value is *truthy* (preserves your old semantics).
        - MANYTOONE accepts an id, [id], or an instance.
        - Collection rels (MANYTOMANY / ONETOMANY) append missing items (no removals).
        Pass names in `_replace_collections` to replace instead of append.
        - Columns: booleans set when changed; other columns set when non-None and changed.

        `write_none=True` (PAD-367) is for values read in the form layer's `present` mode,
        where a None means "the client sent this key empty", not "the client did not send
        it": a nullable column or MANYTOONE is set to NULL, and a NOT NULL one raises
        `NotNullableFieldError` before anything is written. A password is never cleared
        and a collection is never emptied this way. The default is today's behaviour.
        """
        with db.session.no_autoflush:
            mapper = inspect(self.__class__)
            rel_map = {rel.key: rel for rel in class_mapper(type(self)).relationships}

            if write_none:
                refused = [
                    key for key, incoming in values.items()
                    if incoming is None and not self._may_be_null(key, rel_map, mapper)
                ]
                if refused:
                    raise NotNullableFieldError(refused)

            for key, incoming in values.items():
                if key in rel_map:
                    if write_none and incoming is None:
                        if rel_map[key].direction.name == "MANYTOONE":
                            self._clear_many_to_one(key, rel_map[key])
                        continue
                    if not incoming:
                        continue
                    self._apply_relationship(
                        key,
                        incoming,
                        rel_map[key],
                        mapper,
                        replace=(key in _replace_collections),
                    )
                elif write_none and incoming is None:
                    self._clear_column(key, mapper)
                else:
                    self._apply_column(key, incoming, mapper)
        return True

    # ---------- helpers ----------

    @staticmethod
    def _may_be_null(key, rel_map, mapper) -> bool:
        """Whether a None for `key` can be honoured (or is simply ignored) under write_none."""
        if key in rel_map:
            relationship = rel_map[key]
            if relationship.direction.name != "MANYTOONE":
                return True  # a collection is never emptied by a None: ignored, not refused
            return all(column.nullable for column in relationship.local_columns)
        column = mapper.columns.get(key)
        if column is None or key == "password":
            return True  # not a column, or the one column a None never touches
        return bool(column.nullable)

    def _clear_many_to_one(self, key, relationship) -> None:
        if getattr(self, key) is not None:
            setattr(self, key, None)
        for column in relationship.local_columns:
            if getattr(self, column.key, None) is not None:
                setattr(self, column.key, None)

    def _clear_column(self, key, mapper) -> None:
        if mapper.columns.get(key) is None or key == "password":
            return
        if getattr(self, key) is not None:
            setattr(self, key, None)

    def _apply_relationship(
        self, key, incoming, relationship, mapper, *, replace: bool
    ) -> None:
        direction = (
            relationship.direction.name
        )  # 'MANYTOONE' | 'ONETOMANY' | 'MANYTOMANY'
        if direction == "MANYTOONE":
            self._apply_many_to_one(key, incoming, relationship, mapper)
        elif direction in ("MANYTOMANY", "ONETOMANY"):
            self._apply_collection(key, incoming, relationship, replace=replace)

    def _resolve_instance(self, relationship, incoming):
        """Return ORM instance from id/[id]/instance; None if not found."""
        if hasattr(incoming, "__mapper__"):
            return incoming
        if isinstance(incoming, (list, tuple)):
            incoming = incoming[0] if incoming else None
        if incoming is None:
            return None
        cls = relationship.mapper.class_
        return cls.query.filter_by(id=incoming).first()

    def _apply_many_to_one(self, key, incoming, relationship, mapper) -> None:
        inst = self._resolve_instance(relationship, incoming)
        if inst is None:
            return
        if getattr(self, key) is not inst:
            setattr(self, key, inst)

        fk_attr = f"{key}_id"
        if mapper.columns.get(fk_attr) is not None:
            if getattr(self, fk_attr, None) != getattr(inst, "id", None):
                setattr(self, fk_attr, getattr(inst, "id", None))

    def _apply_collection(self, key, incoming, relationship, *, replace: bool) -> None:
        cls = relationship.mapper.class_
        if incoming and hasattr(incoming[0], "__mapper__"):
            instances = list(incoming)
        else:
            ids = list(incoming) if isinstance(incoming, (list, tuple)) else [incoming]
            instances = cls.query.filter(cls.id.in_(ids)).all()

        coll = getattr(self, key)
        if replace:
            coll.clear()
            coll.extend(instances)
            return

        existing = set(coll)
        for inst in instances:
            if inst not in existing:
                coll.append(inst)

    def _apply_column(self, key, incoming, mapper) -> None:
        column = mapper.columns.get(key)
        if column is None:
            return

        current = getattr(self, key)
        if isinstance(column.type, Boolean):
            if incoming != current:
                setattr(self, key, incoming)
            return

        # Defense-in-depth: never let an empty/blank password (or a hash of one)
        # overwrite an existing password column. The primary guard lives in
        # set_password_value, but this catches any future code path that
        # bypasses the form layer.
        if key == "password" and incoming is not None:
            if not str(incoming).strip():
                from flask import current_app
                current_app.logger.warning(
                    "Refusing to overwrite password column with empty value on %s",
                    type(self).__name__,
                )
                return
            try:
                from werkzeug.security import check_password_hash
                if check_password_hash(str(incoming), ""):
                    from flask import current_app
                    current_app.logger.warning(
                        "Refusing to overwrite password column with hash-of-empty-string on %s",
                        type(self).__name__,
                    )
                    return
            except Exception:
                # If the value isn't a valid hash format, fall through to the
                # generic comparison — that path is unaffected by this guard.
                pass

        if incoming is not None and incoming != current:
            setattr(self, key, incoming)

    def get_create_form(self):
        # Define this method in each derived class
        raise NotImplementedError

    def get_edit_form(self):
        # A secret column (users.password, token hashes, ...) never pre-fills a
        # form: the value stays None so a stored hash is never read back out.
        from padel_app.tools.redaction import redacted_columns

        hidden = redacted_columns(self)
        form = self.get_create_form()
        for field in form.fields:
            field.value = None if field.name in hidden else getattr(self, field.name)
        return form


class Image(db.Model):
    __tablename__ = "images"
    id = Column(Integer, primary_key=True)

    object_key = Column(String(512), nullable=False, unique=True)
    content_type = Column(String(128))
    size_bytes = Column(BigInteger)
    # Private by default: the bucket carries no public ACL (B-047), so an
    # object is only reachable through a signed URL unless something
    # deliberately marks it public.
    is_public = Column(Boolean, nullable=False, default=False)

    imageable_id = Column(
        Integer, ForeignKey("imageables.imageable_id", ondelete="CASCADE")
    )
    # PAD-274 (audit M15b): no delete cascade on the many-to-one side — deleting
    # an Image must never delete the object that owns it.
    imageable = relationship("Imageable", back_populates="images")

    def create(self):
        db.session.add(self)
        db.session.commit()
        return True

    def add_to_session(self):
        db.session.add(self)
        return True

    def delete(self):
        db.session.delete(self)
        db.session.commit()
        return True

    def save(self):
        db.session.commit()
        return True

    def _blob(self):
        return _storage_client().bucket(GCS_BUCKET).blob(self.object_key)

    def public_url(self):
        return f"{PUBLIC_BASE}/{self.object_key}"

    def signed_url(self, minutes=SIGNED_URL_MINUTES, method="GET"):
        """A V4 signed URL for this object.

        On the VM the app runs under compute-engine credentials, which carry a
        token and no private key — `generate_signed_url` raises outright there
        rather than falling back on its own. Signing has to be routed through
        the IAM `signBlob` API by naming the service account and passing a live
        access token, which is why `vm_sa` holds
        `roles/iam.serviceAccountTokenCreator` on itself (B-047). Locally, where
        credentials do have a signer, the plain call already works.
        """
        blob = self._blob()
        expiration = timedelta(minutes=minutes)
        try:
            return blob.generate_signed_url(
                version="v4", expiration=expiration, method=method
            )
        except AttributeError:
            credentials = _signing_credentials()
            return blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method=method,
                service_account_email=credentials.service_account_email,
                access_token=credentials.token,
            )

    def url(self):
        """The URL a client may load this image from, or None.

        B-018: a private image needs a signer — a configured bucket and a
        service account allowed to sign (``iam.serviceAccountTokenCreator``).
        An environment without one (staging carries no bucket; a VM whose IAM
        binding was never applied) must degrade to "no image", never to a 500
        on every page that serializes a user, club or message. Signing is
        also per image, so a page of avatars cannot afford a fresh client each
        time — see :func:`_storage_client` — nor a fresh signature: the result is
        reused per object key for ``SIGNED_URL_REUSE_MINUTES`` (PAD-593).
        """
        if self.is_public:
            return self.public_url()
        if not GCS_BUCKET:
            return None
        # PAD-593: one signing per image per window, not per image per response.
        return _cached_signing(self.object_key, self.signed_url)


class Imageable(db.Model):
    __tablename__ = "imageables"
    imageable_id = Column(Integer, primary_key=True)
    type = Column(String(50))
    __mapper_args__ = {"polymorphic_identity": "imageable", "polymorphic_on": type}
    images = relationship("Image", back_populates="imageable", cascade="all", passive_deletes=True)

    def create(self):
        db.session.add(self)
        db.session.commit()
        return True

    def delete(self):
        db.session.expunge(self)
        db.session.delete(self)
        db.session.commit()
        return True
