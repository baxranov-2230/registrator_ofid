"""server-side timestamp defaults + indexes for list/dashboard queries

Two changes, both from the audit:

D-01 — request_history, request_files, messages, audit_logs and notifications
defaulted their created_at from Python's naive datetime.utcnow() into a
timezone-aware column. Adding a server_default of now() means the database
supplies a correct aware value even for rows inserted outside the ORM.

C-01/C-04 — the dashboard aggregates and the SLA sweep filter on
(status, sla_deadline) and closed_at, which had no supporting index.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-11
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_TIMESTAMP_TABLES = (
    "request_history",
    "request_files",
    "messages",
    "audit_logs",
    "notifications",
)


def upgrade() -> None:
    for table in _TIMESTAMP_TABLES:
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=sa.text("now()"),
        )

    op.create_index(
        "ix_requests_status_sla_deadline",
        "requests",
        ["status", "sla_deadline"],
    )
    op.create_index("ix_requests_closed_at", "requests", ["closed_at"])
    op.create_index("ix_requests_category_id", "requests", ["category_id"])
    op.create_index(
        "ix_notifications_user_unread",
        "notifications",
        ["user_id", "is_read", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_index("ix_requests_category_id", table_name="requests")
    op.drop_index("ix_requests_closed_at", table_name="requests")
    op.drop_index("ix_requests_status_sla_deadline", table_name="requests")

    for table in _TIMESTAMP_TABLES:
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=None,
        )
