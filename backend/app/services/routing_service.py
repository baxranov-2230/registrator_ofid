"""Automatic routing of a new request to the employee who will handle it.

Students do not pick who handles their request. The service type they file
under decides the route (`ServiceRouting`, set in Murojaat turlari):

* `faculty_manager` — employees are bound to a faculty, and optionally a
  department, in the admin panel (Registrator ofis → Xodimlar), and that
  binding decides who receives the request:

  1. a staff member bound to the student's faculty — one from the student's
     own department when there is one, otherwise any from the faculty;
  2. failing that, a registrator bound to the faculty.

* `general_manager` — whatever the student's faculty, the employee chosen on
  the service itself (`RequestCategory.assignee_id`); when none is chosen, or
  the chosen one can no longer take requests, a staff member or registrator
  flagged as the manager for general issues.

* `auto_reply` — nobody; the system answers on the spot (see
  `request_service.create_request`).

The request goes straight to that person and is worked from there; there is no
triage step in between.
"""

import logging

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Employee, Faculty, Request, RequestCategory, Role, User
from app.models.category import ServiceRouting
from app.models.request import RequestStatus

log = logging.getLogger(__name__)


class NoHandlerForFaculty(HTTPException):
    """Nobody is bound to the student's faculty.

    Raised as a 409 rather than a 500: the request is well-formed, the system
    is simply not configured to receive it yet. Routing to some arbitrary
    employee would put the request in front of the wrong office, so it fails
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


class NoGeneralManager(HTTPException):
    """The service goes to the general-issues manager, and nobody is one."""

    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            detail=(
                "Umumiy masalalar bo'yicha menejer biriktirilmagan. "
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

    Closed requests are excluded so that someone who has handled a lot of
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


async def _least_loaded(db: AsyncSession, candidates: list[User]) -> User | None:
    """The candidate carrying the fewest open requests; ties break on id so the
    choice is deterministic and testable."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    load = await _open_load(db, [c.id for c in candidates])
    return min(candidates, key=lambda c: (load.get(c.id, 0), c.id))


async def _bound_employees(
    db: AsyncSession, role: str, faculty_id: int
) -> list[tuple[User, int | None]]:
    """Active users of `role` bound to the faculty, with their department."""
    rows = (
        await db.execute(
            select(User, Employee.department_id)
            .join(Role)
            .join(Employee, Employee.user_id == User.id)
            .where(
                Role.name == role,
                User.is_active.is_(True),
                Employee.faculty_id == faculty_id,
            )
            .options(selectinload(User.role))
            .order_by(User.id.asc())
        )
    ).all()
    return [(user, department_id) for user, department_id in rows]


async def find_staff_for(
    db: AsyncSession, faculty_id: int, department_id: int | None
) -> User | None:
    """Pick the staff member who should handle a request from this faculty.

    A staff member bound to the student's own department is preferred; when the
    department has nobody, anyone bound to the faculty will do.
    """
    staff = await _bound_employees(db, Role.STAFF, faculty_id)
    if department_id is not None:
        same_department = [user for user, dept in staff if dept == department_id]
        if same_department:
            return await _least_loaded(db, same_department)
    return await _least_loaded(db, [user for user, _ in staff])


async def find_registrator_for_faculty(db: AsyncSession, faculty_id: int) -> User | None:
    """Pick the registrator who should receive a request from this faculty."""
    registrators = await _bound_employees(db, Role.REGISTRATOR, faculty_id)
    return await _least_loaded(db, [user for user, _ in registrators])


async def find_general_manager(db: AsyncSession) -> User | None:
    """Pick the general-issues manager with the lightest open load."""
    managers = (
        (
            await db.execute(
                select(User)
                .join(Role)
                .join(Employee, Employee.user_id == User.id)
                .where(
                    Role.name.in_((Role.STAFF, Role.REGISTRATOR)),
                    User.is_active.is_(True),
                    Employee.is_general_manager.is_(True),
                )
                .options(selectinload(User.role))
                .order_by(User.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return await _least_loaded(db, list(managers))


async def find_service_assignee(db: AsyncSession, assignee_id: int) -> User | None:
    """The employee chosen on a service, if they can still take requests.

    The choice is checked when it is saved, but the employee may since have
    been deactivated or moved to a role routing never hands work to.
    """
    return (
        await db.execute(
            select(User)
            .join(Role)
            .where(
                User.id == assignee_id,
                User.is_active.is_(True),
                Role.name.in_((Role.STAFF, Role.REGISTRATOR)),
            )
            .options(selectinload(User.role))
        )
    ).scalar_one_or_none()


async def resolve_handler(db: AsyncSession, student: User, service: RequestCategory) -> User:
    """The employee a request filed under `service` goes to.

    Not for `auto_reply` services: those have no handler at all.
    """
    if service.routing == ServiceRouting.GENERAL_MANAGER:
        handler = None
        if service.assignee_id is not None:
            handler = await find_service_assignee(db, service.assignee_id)
            if handler is None:
                log.warning(
                    "Service %s names employee %s, who can no longer take requests; "
                    "falling back to the general managers",
                    service.id,
                    service.assignee_id,
                )
        if handler is None:
            handler = await find_general_manager(db)
        if handler is None:
            raise NoGeneralManager()
        log.info(
            "Routed new request from student %s to general manager %s %s",
            student.id,
            handler.role_name,
            handler.id,
        )
        return handler
    return await resolve_handler_for_student(db, student)


async def resolve_handler_for_student(db: AsyncSession, student: User) -> User:
    """Resolve the employee a student's new request goes to.

    Raises rather than returning None: an unroutable request must not be
    silently created with no owner, because nobody's dashboard would show it.
    """
    if student.faculty_id is None:
        raise StudentHasNoFaculty()

    handler = await find_staff_for(db, student.faculty_id, student.department_id)
    if handler is None:
        handler = await find_registrator_for_faculty(db, student.faculty_id)
    if handler is None:
        # `student.faculty` is a lazy relationship and the caller's User is not
        # loaded with it, so name the faculty with an explicit read.
        faculty_name = (
            await db.execute(select(Faculty.name).where(Faculty.id == student.faculty_id))
        ).scalar_one_or_none()
        raise NoHandlerForFaculty(faculty_name)

    log.info(
        "Routed new request from student %s (faculty %s) to %s %s",
        student.id,
        student.faculty_id,
        handler.role_name,
        handler.id,
    )
    return handler
