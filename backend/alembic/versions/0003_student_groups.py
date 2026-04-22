"""add student_groups table and FK, faculties.hemis_id

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # faculties.hemis_id
    op.add_column("faculties", sa.Column("hemis_id", sa.String(64), nullable=True))
    op.create_index("ix_faculties_hemis_id", "faculties", ["hemis_id"], unique=True)

    # student_groups table
    op.create_table(
        "student_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "faculty_id",
            sa.Integer(),
            sa.ForeignKey("faculties.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("hemis_id", sa.String(64), nullable=True),
        sa.Column("specialty", sa.String(255), nullable=True),
        sa.Column("education_year", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_student_groups_faculty_id", "student_groups", ["faculty_id"])
    op.create_index("ix_student_groups_name", "student_groups", ["name"])
    op.create_index("ix_student_groups_hemis_id", "student_groups", ["hemis_id"], unique=True)

    # users.student_group_id
    op.add_column(
        "users",
        sa.Column("student_group_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_student_group_id",
        "users",
        "student_groups",
        ["student_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_student_group_id", "users", ["student_group_id"])


def downgrade() -> None:
    op.drop_index("ix_users_student_group_id", table_name="users")
    op.drop_constraint("fk_users_student_group_id", "users", type_="foreignkey")
    op.drop_column("users", "student_group_id")

    op.drop_index("ix_student_groups_hemis_id", table_name="student_groups")
    op.drop_index("ix_student_groups_name", table_name="student_groups")
    op.drop_index("ix_student_groups_faculty_id", table_name="student_groups")
    op.drop_table("student_groups")

    op.drop_index("ix_faculties_hemis_id", table_name="faculties")
    op.drop_column("faculties", "hemis_id")
