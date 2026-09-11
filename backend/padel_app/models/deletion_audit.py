from sqlalchemy import JSON, Column, ForeignKey, Index, Integer, String

from padel_app import model
from padel_app.sql_db import db
from padel_app.tools.input_tools import Block, Field, Form


class DeletionAudit(db.Model, model.Model):
    """One row per delete that has no undo (PAD-274, audit M15b; B-057).

    Written by the service BEFORE it deletes, in the same transaction, so the
    record and the delete commit or fail together. `details` holds what the
    delete took with it (counts), measured just before it ran. Superadmins read
    it in the generic editor.
    """

    __tablename__ = "deletion_audit"
    # Declared here too so the drift gate (flask db check, PAD-220) sees the same
    # schema the PAD-274 migration built; without it autogenerate wants to drop it.
    __table_args__ = (
        Index("ix_deletion_audit_entity", "entity", "entity_id"),
        {"extend_existing": True},
    )

    page_title = "Deletion Audit"
    model_name = "DeletionAudit"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=False)
    entity = Column(String(40), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(40), nullable=False)
    label = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)

    @property
    def name(self):
        return f"{self.entity} {self.entity_id} ({self.action})"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "label", "label": "Label"}
        columns = [
            {"field": "entity", "label": "Entity"},
            {"field": "entity_id", "label": "Id"},
            {"field": "action", "label": "Action"},
            {"field": "label", "label": "Label"},
            {"field": "created_at", "label": "When"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False):
            return Field(instance_id=cls.id, model=cls.model_name, name=name, label=label, type=type, required=required)

        form = Form()
        form.add_block(Block("info_block", fields=[
            get_field("entity", "Entity", "Text", required=True),
            get_field("entity_id", "Id", "Integer", required=True),
            get_field("action", "Action", "Text", required=True),
            get_field("label", "Label", "Text"),
        ]))
        return form
