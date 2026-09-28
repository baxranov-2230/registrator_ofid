"""API clients for server-to-server integrations.

* `api_clients` — external systems that authenticate with a client id and
  secret (OAuth2 client_credentials). Only the secret's SHA-256 digest is
  stored.
* `requests.api_client_id` — the client that filed the request. A client reads
  only its own requests, so the column is indexed.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _json_type():
    return postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "api_clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.String(500)),
        sa.Column("client_id", sa.String(64), nullable=False, unique=True),
        sa.Column("secret_hash", sa.String(64), nullable=False),
        sa.Column("secret_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("scopes", _json_type(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_api_clients_client_id", "api_clients", ["client_id"])

    op.add_column(
        "requests",
        sa.Column(
            "api_client_id",
            sa.Integer(),
            sa.ForeignKey("api_clients.id", ondelete="SET NULL", name="fk_requests_api_client_id"),
        ),
    )
    op.create_index("ix_requests_api_client_id", "requests", ["api_client_id"])


def downgrade() -> None:
    op.drop_index("ix_requests_api_client_id", table_name="requests")
    op.drop_constraint("fk_requests_api_client_id", "requests", type_="foreignkey")
    op.drop_column("requests", "api_client_id")
    op.drop_index("ix_api_clients_client_id", table_name="api_clients")
    op.drop_table("api_clients")
