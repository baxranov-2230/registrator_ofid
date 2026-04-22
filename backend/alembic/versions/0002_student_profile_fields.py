"""add student profile fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("birth_date", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("gender", sa.String(16), nullable=True))
    op.add_column("users", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("image_path", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("specialty", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("group_name", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("level", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("semester", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("student_status", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("education_form", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("education_type", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("education_lang", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("payment_form", sa.String(64), nullable=True))


def downgrade() -> None:
    for col in [
        "birth_date", "gender", "address", "image_path", "specialty",
        "group_name", "level", "semester", "student_status", "education_form",
        "education_type", "education_lang", "payment_form",
    ]:
        op.drop_column("users", col)
