"""Request types, service types and per-service routing.

The catalogue stays one two-level tree: a root row is a request type
("Murojaat turi"), its children are service types ("Xizmat turi").

* `request_categories.description` — the request type's "Tasnifi".
* `request_categories.routing` — where a request filed under the service
  goes: `auto_reply`, `faculty_manager` or `general_manager`. Existing rows
  become `faculty_manager`, which is how every request was routed until now.
* `request_categories.auto_reply_text` — the answer an `auto_reply` service
  sends.
* `employees.is_general_manager` — who receives `general_manager` requests.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("request_categories", sa.Column("description", sa.Text()))
    op.add_column(
        "request_categories",
        sa.Column(
            "routing",
            sa.String(length=32),
            nullable=False,
            server_default="faculty_manager",
        ),
    )
    op.add_column("request_categories", sa.Column("auto_reply_text", sa.Text()))
    op.add_column(
        "employees",
        sa.Column("is_general_manager", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("employees", "is_general_manager")
    op.drop_column("request_categories", "auto_reply_text")
    op.drop_column("request_categories", "routing")
    op.drop_column("request_categories", "description")
