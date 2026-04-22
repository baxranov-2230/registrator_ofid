"""Populate dev seed data. Idempotent: safe to re-run."""
import asyncio
import logging

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Department, Faculty, RequestCategory, Role, User

log = logging.getLogger(__name__)


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

SEED_CATEGORIES = [
    ("Oddiy savol / Ma'lumot so'rash", 24, "low", "help_outline"),
    ("Ma'lumotnoma talab qilish", 48, "normal", "description"),
    ("Rasmiy ariza", 72, "normal", "article"),
    ("Shikoyat", 48, "high", "report"),
    ("Moliyaviy murojaat", 120, "high", "payments"),
    ("Favqulodda murojaat", 4, "critical", "warning"),
]

SEED_USERS = [
    dict(full_name="Sardor Admin", email="admin@royd.uz", password="admin123", role="admin"),
    dict(full_name="Nargiza Registrator", email="registrator@royd.uz", password="reg123", role="registrator"),
    dict(full_name="Rahbar Alibekov", email="leadership@royd.uz", password="lead123", role="leadership"),
    dict(full_name="Aziz Toshev", email="staff1@royd.uz", password="staff123", role="staff", faculty="IT", department="DI"),
    dict(full_name="Zulfiya Norova", email="staff2@royd.uz", password="staff123", role="staff", faculty="IT", department="KI"),
    dict(full_name="Shaxlo Asqarova", email="staff3@royd.uz", password="staff123", role="staff", faculty="EC", department="BI"),
]


async def seed() -> None:
    logging.basicConfig(level=logging.INFO)
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

        for name, sla, priority, icon in SEED_CATEGORIES:
            row = (
                await db.execute(select(RequestCategory).where(RequestCategory.name == name))
            ).scalar_one_or_none()
            if not row:
                row = RequestCategory(
                    parent_id=None,
                    name=name,
                    sla_hours=sla,
                    priority=priority,
                    icon=icon,
                    is_active=True,
                )
                db.add(row)
                await db.flush()
                log.info("category: %s", name)

        for u in SEED_USERS:
            existing = (
                await db.execute(select(User).where(User.email == u["email"]))
            ).scalar_one_or_none()
            if existing:
                continue
            faculty_id = faculties[u["faculty"]].id if u.get("faculty") else None
            dept_id = (
                departments[(u["faculty"], u["department"])].id
                if u.get("department")
                else None
            )
            user = User(
                full_name=u["full_name"],
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role_id=roles[u["role"]].id,
                faculty_id=faculty_id,
                department_id=dept_id,
                is_active=True,
            )
            db.add(user)
            log.info("user: %s (%s)", u["email"], u["role"])

        await db.commit()
        log.info("seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
