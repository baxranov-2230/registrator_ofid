"""Trigram search indexes and an append-only audit log (PostgreSQL only).

* Request search is `ILIKE '%term%'`, which no b-tree index can serve. GIN
  trigram indexes make it an index scan instead of a full table read.
* The Reglament (12.1) says the audit log cannot be deleted. Until now it was
  an ordinary table any database session could rewrite. A trigger now rejects
  UPDATE and DELETE outright; TRUNCATE is refused the same way.

Revision ID: 0007
Revises: 0006
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_TRGM_INDEXES = {
    "ix_requests_title_trgm": "title",
    "ix_requests_description_trgm": "description",
    "ix_requests_tracking_no_trgm": "tracking_no",
}


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, column in _TRGM_INDEXES.items():
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON requests USING gin ({column} gin_trgm_ops)"
        )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_logs_no_update_delete
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_logs_no_truncate
        BEFORE TRUNCATE ON audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only()
        """
    )


def downgrade() -> None:
    if not _is_postgres():
        return

    op.execute("DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs")
    op.execute("DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_append_only()")
    for name in _TRGM_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
