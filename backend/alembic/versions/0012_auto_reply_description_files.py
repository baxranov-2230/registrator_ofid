"""A description ("Tasnifi") and files on an automatic answer.

* `request_categories.auto_reply_description` — the "Tasnifi" an `auto_reply`
  service sends with its answer text.
* `auto_reply_files` — the files it sends with it, uploaded once per service.
* `requests.answer_description` — the description as it was sent, kept on the
  request so later edits to the service do not rewrite past answers.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("request_categories", sa.Column("auto_reply_description", sa.Text()))
    op.add_column("requests", sa.Column("answer_description", sa.Text()))
    op.create_table(
        "auto_reply_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("request_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_auto_reply_files_category_id", "auto_reply_files", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_auto_reply_files_category_id", table_name="auto_reply_files")
    op.drop_table("auto_reply_files")
    op.drop_column("requests", "answer_description")
    op.drop_column("request_categories", "auto_reply_description")
