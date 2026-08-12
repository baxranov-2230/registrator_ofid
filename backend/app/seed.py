"""Populate dev seed data. Idempotent: safe to re-run."""

import asyncio
import logging
import os

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Department, Employee, Faculty, RequestCategory, Role, User
from app.services_catalog import SERVICE_CATALOG, total_services

log = logging.getLogger(__name__)


async def seed_service_catalog(db) -> None:
    """Install the 6 service types and their 59 services.

    Idempotent, and safe on a database that already holds requests: rows are
    matched by (name, parent) and updated in place rather than recreated, so
    existing `requests.category_id` references stay valid. The old flat
    placeholder categories are retired with `is_active=False` instead of being
    deleted, because historical requests still point at them (C-05).
    """
    seeded_ids: set[int] = set()

    for type_name, sla, priority, icon, services in SERVICE_CATALOG:
        svc_type = (
            await db.execute(
                select(RequestCategory).where(
                    RequestCategory.name == type_name,
                    RequestCategory.parent_id.is_(None),
                )
            )
        ).scalar_one_or_none()
        if svc_type is None:
            svc_type = RequestCategory(parent_id=None, name=type_name)
            db.add(svc_type)
        svc_type.sla_hours = sla
        svc_type.priority = priority
        svc_type.icon = icon
        svc_type.is_active = True
        await db.flush()
        seeded_ids.add(svc_type.id)

        for service_name in services:
            service = (
                await db.execute(
                    select(RequestCategory).where(
                        RequestCategory.name == service_name,
                        RequestCategory.parent_id == svc_type.id,
                    )
                )
            ).scalar_one_or_none()
            if service is None:
                # A service inherits its type's SLA and priority on creation.
                # On re-runs these are left alone, so an admin's tuning of an
                # individual service survives reseeding.
                service = RequestCategory(
                    parent_id=svc_type.id,
                    name=service_name,
                    sla_hours=sla,
                    priority=priority,
                )
                db.add(service)
            service.is_active = True
            await db.flush()
            seeded_ids.add(service.id)

    # Retire anything left over from the old flat catalogue.
    stale = (
        (
            await db.execute(
                select(RequestCategory).where(
                    RequestCategory.id.notin_(seeded_ids),
                    RequestCategory.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    for row in stale:
        row.is_active = False
        log.info("retired legacy category: %s", row.name)

    log.info(
        "service catalog: %d types, %d services",
        len(SERVICE_CATALOG),
        total_services(),
    )


SEED_ROLES = [
    ("student", "Talaba"),
    ("registrator", "Registrator / operator"),
    ("staff", "Fakultet xodimi"),
    ("admin", "Administrator"),
    ("leadership", "Rahbariyat"),
]

SEED_FACULTIES = [
    ("Axborot texnologiyalari", "IT", "it@ndki.uz"),
    ("Iqtisodiyot", "EC", "ec@ndki.uz"),
]

SEED_DEPARTMENTS = [
    ("IT", "Dasturiy injiniring", "DI"),
    ("IT", "Kompyuter injiniringi", "KI"),
    ("EC", "Bank ishi", "BI"),
    ("EC", "Marketing", "MK"),
]

SEED_USERS = [
    dict(full_name="Sardor Admin", email="admin@royd.uz", password="admin123", role="admin"),
    # Registrators are routed to by faculty, so each one must be bound to a
    # faculty or requests from that faculty cannot be submitted at all.
    dict(
        full_name="Nargiza Registrator",
        email="registrator@royd.uz",
        password="reg123",
        role="registrator",
        faculty="IT",
    ),
    dict(
        full_name="Dilnoza Registrator",
        email="registrator2@royd.uz",
        password="reg123",
        role="registrator",
        faculty="EC",
    ),
    dict(
        full_name="Rahbar Alibekov",
        email="leadership@royd.uz",
        password="lead123",
        role="leadership",
    ),
    dict(
        full_name="Aziz Toshev",
        email="staff1@royd.uz",
        password="staff123",
        role="staff",
        faculty="IT",
        department="DI",
    ),
    dict(
        full_name="Zulfiya Norova",
        email="staff2@royd.uz",
        password="staff123",
        role="staff",
        faculty="IT",
        department="KI",
    ),
    dict(
        full_name="Shaxlo Asqarova",
        email="staff3@royd.uz",
        password="staff123",
        role="staff",
        faculty="EC",
        department="BI",
    ),
]


async def seed() -> None:
    logging.basicConfig(level=logging.INFO)

    # These accounts use well-known passwords that are published in the README.
    # Creating them on a real deployment would hand out an admin login (F-07).
    if not settings.is_dev and os.getenv("ROYD_ALLOW_SEED") != "yes":
        raise SystemExit(
            f"Refusing to seed with ENV={settings.env!r}: the seed users have public "
            "passwords. Set ROYD_ALLOW_SEED=yes only if you really mean it."
        )
    async with SessionLocal() as db:
        roles: dict[str, Role] = {}
        for name, desc in SEED_ROLES:
            row = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
            if not row:
                row = Role(name=name, description=desc, permissions={})
                db.add(row)
                await db.flush()
                log.info("role: %s", name)
            roles[name] = row

        faculties: dict[str, Faculty] = {}
        for name, code, email in SEED_FACULTIES:
            row = (
                await db.execute(select(Faculty).where(Faculty.code == code))
            ).scalar_one_or_none()
            if not row:
                row = Faculty(name=name, code=code, contact_email=email, is_active=True)
                db.add(row)
                await db.flush()
                log.info("faculty: %s", name)
            faculties[code] = row

        departments: dict[tuple[str, str], Department] = {}
        for fac_code, name, dept_code in SEED_DEPARTMENTS:
            fac = faculties[fac_code]
            row = (
                await db.execute(
                    select(Department).where(
                        Department.code == dept_code, Department.faculty_id == fac.id
                    )
                )
            ).scalar_one_or_none()
            if not row:
                row = Department(faculty_id=fac.id, name=name, code=dept_code)
                db.add(row)
                await db.flush()
                log.info("department: %s/%s", fac_code, name)
            departments[(fac_code, dept_code)] = row

        await seed_service_catalog(db)

        for u in SEED_USERS:
            existing = (
                await db.execute(select(User).where(User.email == u["email"]))
            ).scalar_one_or_none()
            if existing:
                continue
            faculty_id = faculties[u["faculty"]].id if u.get("faculty") else None
            dept_id = (
                departments[(u["faculty"], u["department"])].id if u.get("department") else None
            )
            user = User(
                full_name=u["full_name"],
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role_id=roles[u["role"]].id,
                is_active=True,
            )
            db.add(user)
            await db.flush()
            # Seeded accounts are all staff; the faculty binding lives on the
            # employee profile and is what routes requests to a registrator.
            db.add(Employee(user_id=user.id, faculty_id=faculty_id, department_id=dept_id))
            log.info("user: %s (%s)", u["email"], u["role"])

        await db.commit()
        log.info("seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
