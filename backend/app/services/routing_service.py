"""Automatic routing of a new request to a registrator.

Students no longer pick who handles their request. Registrators are bound to a
faculty in the admin panel (Registrator ofis → Xodimlar → Fakultetga
biriktirish), so the student's own faculty decides who receives it.
"""

import logging

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Employee, Faculty, Request, Role, User
from app.models.request import RequestStatus

log = logging.getLogger(__name__)


class NoRegistratorForFaculty(HTTPException):
    """No registrator is bound to the student's faculty.

    Raised as a 409 rather than a 500: the request is well-formed, the system
    is simply not configured to receive it yet. Routing to some arbitrary
    registrator would put the request in front of the wrong office, so it fails
    loudly instead.
    """

    def __init__(self, faculty_name: str | None) -> None:
        where = f"'{faculty_name}' fakultetiga" if faculty_name else "Sizning fakultetingizga"
        super().__init__(
            status_code=409,
            detail=(
                f"{where} Registrator ofis xodimi biriktirilmagan. "
                "Iltimos, administratorga murojaat qiling."
            ),
        )


class StudentHasNoFaculty(HTTPException):
    """The student's profile carries no faculty, so routing has no input."""

    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            detail=(
                "Profilingizda fakultet ko'rsatilmagan, shuning uchun murojaatni "
                "yo'naltirib bo'lmadi. Iltimos, administratorga murojaat qiling."
            ),
        )


async def _open_load(db: AsyncSession, user_ids: list[int]) -> dict[int, int]:
    """Count each candidate's still-open requests.

    Closed requests are excluded so that a registrator who has handled a lot of
    traffic historically is not starved of new work.
    """
    if not user_ids:
        return {}
    rows = (
        await db.execute(
            select(Request.assigned_to, func.count())
            .where(
                Request.assigned_to.in_(user_ids),
                Request.status.in_(RequestStatus.OPEN),
            )
            .group_by(Request.assigned_to)
        )
    ).all()
    return {assignee_id: count for assignee_id, count in rows}


async def find_registrator_for_faculty(db: AsyncSession, faculty_id: int) -> User | None:
    """Pick the registrator who should receive a request from this faculty.

    With a single bound registrator this returns that person. With several, the
    one carrying the fewest open requests wins, which spreads the faculty's
    queue instead of always landing on the lowest id. Ties break on id so the
    choice is deterministic and testable.
    """
    candidates = (
        (
            await db.execute(
                select(User)
                .join(Role)
                # The faculty binding lives on the employee profile now.
                .join(Employee, Employee.user_id == User.id)
                .where(
                    Role.name == Role.REGISTRATOR,
                    User.is_active.is_(True),
                    Employee.faculty_id == faculty_id,
                )
                .options(selectinload(User.role))
                .order_by(User.id.asc())
            )
        )
        .scalars()
        .all()
    )
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    load = await _open_load(db, [c.id for c in candidates])
    return min(candidates, key=lambda c: (load.get(c.id, 0), c.id))


async def resolve_assignee_for_student(db: AsyncSession, student: User) -> User:
    """Resolve the registrator a student's new request belongs to.

    Raises rather than returning None: an unroutable request must not be
    silently created with no owner, because nobody's dashboard would show it.
    """
    if student.faculty_id is None:
        raise StudentHasNoFaculty()

    registrator = await find_registrator_for_faculty(db, student.faculty_id)
    if registrator is None:
        # `student.faculty` is a lazy relationship and the caller's User is not
        # loaded with it, so name the faculty with an explicit read.
        faculty_name = (
            await db.execute(select(Faculty.name).where(Faculty.id == student.faculty_id))
        ).scalar_one_or_none()
        raise NoRegistratorForFaculty(faculty_name)

    log.info(
        "Routed new request from student %s (faculty %s) to registrator %s",
        student.id,
        student.faculty_id,
        registrator.id,
    )
    return registrator
