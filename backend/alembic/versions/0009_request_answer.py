"""Final answer on a request.

A request now closes only through "Javob berish": the handler writes a final
answer, optionally with files, and the student reads it as the outcome.

* `requests.answer_text`, `answered_at`, `answered_by` — the answer itself.
* `request_files.is_answer` — files sent with the answer, as opposed to files
  exchanged while the request was being worked.

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("requests", sa.Column("answer_text", sa.Text()))
    op.add_column("requests", sa.Column("answered_at", sa.DateTime(timezone=True)))
    op.add_column(
        "requests",
        sa.Column(
            "answered_by",
            sa.Integer(),
            sa.ForeignKey("users.id", name="fk_requests_answered_by"),
        ),
    )
    op.add_column(
        "request_files",
        sa.Column("is_answer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("request_files", "is_answer")
    op.drop_constraint("fk_requests_answered_by", "requests", type_="foreignkey")
    op.drop_column("requests", "answered_by")
    op.drop_column("requests", "answered_at")
    op.drop_column("requests", "answer_text")
