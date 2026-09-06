"""B-015: make every stored image private

The uploads bucket used to carry `roles/storage.objectViewer` for `allUsers`,
so `Image.url()` returned a permanent unauthenticated
`storage.googleapis.com/<bucket>/<key>` link. That role also grants
`storage.objects.list`, which made the bucket anonymously enumerable — and
object keys were `images/<model>/<timestamp>_<original filename>`, with no
random component. Chat attachments (`Message.attachment`) were exposed the same
way as avatars and club logos.

The grant is now removed in `backend/terraform/main.tf`. Every existing row must
therefore stop claiming to be public: `is_public = True` would send clients to a
public URL that no longer resolves. Flipping them to False routes every read
through `Image.signed_url()`, which is what the application now serves.

This rewrites data, not schema — `is_public` keeps its NOT NULL and gains no
server default (the model-side default is False from this revision on).

Revision ID: f1a2b3c4d5e6
Revises: d5e6f7a8b9c0
Create Date: 2026-09-06
"""

from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE images SET is_public = false WHERE is_public = true")


def downgrade():
    # Restoring "public" is only meaningful alongside re-adding the bucket ACL;
    # the rows are returned to their prior state so the revision is reversible.
    op.execute("UPDATE images SET is_public = true WHERE is_public = false")
