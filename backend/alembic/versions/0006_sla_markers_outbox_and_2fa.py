"""SLA markers, SLA pause, idempotency key, student department, outbox, 2FA.

* `requests.sla_warned_at` / `sla_breached_at` replace the history-comment
  sentinels the SLA sweep used to search for. Existing sentinels are copied
  over so no request is notified a second time after the upgrade.
* `requests.sla_paused_at` stops the SLA clock while a request is returned to
  the student. Requests already in `returned` start paused from the moment
  they were returned.
* `requests.client_ref` is the partner platform's idempotency key.
* `students.department_id` — the HEMIS department was resolved on login but
  never stored, so every request carried a NULL department.
* `outbox` — durable queue for emails and webhooks.
* `users.totp_secret` / `totp_enabled` — optional second factor.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _json_type():
    return postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.add_column("requests", sa.Column("sla_warned_at", sa.DateTime(timezone=True)))
    op.add_column("requests", sa.Column("sla_breached_at", sa.DateTime(timezone=True)))
    op.add_column("requests", sa.Column("sla_paused_at", sa.DateTime(timezone=True)))
    op.add_column("requests", sa.Column("client_ref", sa.String(64)))
    op.create_unique_constraint(
        "uq_requests_student_client_ref", "requests", ["student_id", "client_ref"]
    )

    op.execute(
        """
        UPDATE requests SET sla_warned_at = (
            SELECT MIN(h.created_at) FROM request_history h
            WHERE h.request_id = requests.id AND h.comment LIKE '[sla-warning]%'
        )
        """
    )
    op.execute(
        """
        UPDATE requests SET sla_breached_at = (
            SELECT MIN(h.created_at) FROM request_history h
            WHERE h.request_id = requests.id AND h.comment LIKE '[sla-breach]%'
        )
        """
    )
    op.execute(
        """
        UPDATE requests SET sla_paused_at = (
            SELECT MAX(h.created_at) FROM request_history h
            WHERE h.request_id = requests.id AND h.new_status = 'returned'
        )
        WHERE status = 'returned'
        """
    )

    op.add_column(
        "students",
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id")),
    )

    op.create_table(
        "outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("payload", _json_type(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_error", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_outbox_status_next_attempt", "outbox", ["status", "next_attempt_at"])

    op.add_column("users", sa.Column("totp_secret", sa.String(64)))
    op.add_column(
        "users",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
    op.drop_index("ix_outbox_status_next_attempt", table_name="outbox")
    op.drop_table("outbox")
    op.drop_column("students", "department_id")
    op.drop_constraint("uq_requests_student_client_ref", "requests", type_="unique")
    op.drop_column("requests", "client_ref")
    op.drop_column("requests", "sla_paused_at")
    op.drop_column("requests", "sla_breached_at")
    op.drop_column("requests", "sla_warned_at")
