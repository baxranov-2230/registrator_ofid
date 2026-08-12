"""Split user profiles into separate students and employees tables.

`users` keeps only identity (credentials, role, active flag) so that every
existing foreign key — request authorship, message senders, audit actors —
stays valid. The profile columns move out:

  * student attributes (HEMIS id, group, course, ...) -> `students`
  * staff attributes (faculty binding, department)    -> `employees`

Data is copied before the old columns are dropped, and the downgrade puts it
back, so the migration is reversible without loss.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


#: Columns that belong to a student profile, in (source, target) form.
STUDENT_COLUMNS = [
    "external_student_id",
    "faculty_id",
    "student_group_id",
    "birth_date",
    "gender",
    "address",
    "image_path",
    "specialty",
    "group_name",
    "level",
    "semester",
    "student_status",
    "education_form",
    "education_type",
    "education_lang",
    "payment_form",
]

#: Employee-side columns that already existed on `users`.
EMPLOYEE_COLUMNS = [
    "faculty_id",
    "department_id",
    "birth_date",
    "gender",
    "address",
    "image_path",
]


def upgrade() -> None:
    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("external_student_id", sa.String(64), unique=True),
        sa.Column("faculty_id", sa.Integer(), sa.ForeignKey("faculties.id")),
        sa.Column(
            "student_group_id",
            sa.Integer(),
            sa.ForeignKey("student_groups.id", ondelete="SET NULL"),
        ),
        sa.Column("birth_date", sa.String(32)),
        sa.Column("gender", sa.String(16)),
        sa.Column("address", sa.String(500)),
        sa.Column("image_path", sa.String(500)),
        sa.Column("specialty", sa.String(255)),
        sa.Column("group_name", sa.String(128)),
        sa.Column("level", sa.Integer()),
        sa.Column("semester", sa.Integer()),
        sa.Column("student_status", sa.String(64)),
        sa.Column("education_form", sa.String(64)),
        sa.Column("education_type", sa.String(64)),
        sa.Column("education_lang", sa.String(64)),
        sa.Column("payment_form", sa.String(64)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_students_user_id", "students", ["user_id"])
    op.create_index("ix_students_faculty_id", "students", ["faculty_id"])
    op.create_index("ix_students_student_group_id", "students", ["student_group_id"])
    op.create_index("ix_students_external_student_id", "students", ["external_student_id"])

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("faculty_id", sa.Integer(), sa.ForeignKey("faculties.id")),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id")),
        sa.Column("employee_no", sa.String(64), unique=True),
        sa.Column("position", sa.String(255)),
        sa.Column("hired_at", sa.Date()),
        sa.Column("office", sa.String(128)),
        sa.Column("image_path", sa.String(500)),
        sa.Column("birth_date", sa.String(32)),
        sa.Column("gender", sa.String(16)),
        sa.Column("address", sa.String(500)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_employees_user_id", "employees", ["user_id"])
    op.create_index("ix_employees_faculty_id", "employees", ["faculty_id"])
    op.create_index("ix_employees_employee_no", "employees", ["employee_no"])

    # ── Copy existing rows before dropping the source columns ───────────────
    # Role decides which table a user's profile lands in; every current user
    # has exactly one role, so no row is copied twice or missed.
    student_cols = ", ".join(STUDENT_COLUMNS)
    op.execute(
        f"""
        INSERT INTO students (user_id, {student_cols})
        SELECT u.id, {", ".join(f"u.{c}" for c in STUDENT_COLUMNS)}
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'student'
        """
    )

    employee_cols = ", ".join(EMPLOYEE_COLUMNS)
    op.execute(
        f"""
        INSERT INTO employees (user_id, {employee_cols})
        SELECT u.id, {", ".join(f"u.{c}" for c in EMPLOYEE_COLUMNS)}
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.name <> 'student'
        """
    )

    # ── Retire the moved columns ────────────────────────────────────────────
    for col in [
        "external_student_id",
        "faculty_id",
        "department_id",
        "student_group_id",
        "birth_date",
        "gender",
        "address",
        "image_path",
        "specialty",
        "group_name",
        "level",
        "semester",
        "student_status",
        "education_form",
        "education_type",
        "education_lang",
        "payment_form",
    ]:
        op.drop_column("users", col)


def downgrade() -> None:
    # Restore the columns, then copy the profile data back into them.
    op.add_column("users", sa.Column("external_student_id", sa.String(64)))
    op.add_column("users", sa.Column("faculty_id", sa.Integer()))
    op.add_column("users", sa.Column("department_id", sa.Integer()))
    op.add_column("users", sa.Column("student_group_id", sa.Integer()))
    op.add_column("users", sa.Column("birth_date", sa.String(32)))
    op.add_column("users", sa.Column("gender", sa.String(16)))
    op.add_column("users", sa.Column("address", sa.String(500)))
    op.add_column("users", sa.Column("image_path", sa.String(500)))
    op.add_column("users", sa.Column("specialty", sa.String(255)))
    op.add_column("users", sa.Column("group_name", sa.String(128)))
    op.add_column("users", sa.Column("level", sa.Integer()))
    op.add_column("users", sa.Column("semester", sa.Integer()))
    op.add_column("users", sa.Column("student_status", sa.String(64)))
    op.add_column("users", sa.Column("education_form", sa.String(64)))
    op.add_column("users", sa.Column("education_type", sa.String(64)))
    op.add_column("users", sa.Column("education_lang", sa.String(64)))
    op.add_column("users", sa.Column("payment_form", sa.String(64)))

    op.create_foreign_key(
        "users_faculty_id_fkey", "users", "faculties", ["faculty_id"], ["id"]
    )
    op.create_foreign_key(
        "users_department_id_fkey", "users", "departments", ["department_id"], ["id"]
    )
    op.create_foreign_key(
        "users_student_group_id_fkey",
        "users",
        "student_groups",
        ["student_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "users_external_student_id_key", "users", ["external_student_id"]
    )

    op.execute(
        f"""
        UPDATE users u SET {", ".join(f"{c} = s.{c}" for c in STUDENT_COLUMNS)}
        FROM students s WHERE s.user_id = u.id
        """
    )
    op.execute(
        f"""
        UPDATE users u SET {", ".join(f"{c} = e.{c}" for c in EMPLOYEE_COLUMNS)}
        FROM employees e WHERE e.user_id = u.id
        """
    )

    op.drop_table("employees")
    op.drop_table("students")
