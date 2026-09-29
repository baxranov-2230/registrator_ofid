"""An employee chosen per service for general-issue routing.

* `request_categories.assignee_id` — who receives requests filed under a
  `general_manager` service. Unset, they keep going to the employees flagged
  `is_general_manager`, which is how every such service behaved until now.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "request_categories",
        sa.Column(
            "assignee_id",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                name="fk_request_categories_assignee_id_users",
                ondelete="SET NULL",
            ),
        ),
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_request_categories_assignee_id_users", "request_categories", type_="foreignkey"
    )
    op.drop_column("request_categories", "assignee_id")
