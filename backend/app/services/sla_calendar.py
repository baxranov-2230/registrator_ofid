"""Working-day arithmetic for SLA deadlines (Reglament 7.3).

"SLA muddatlarini hisoblashda faqat ish kunlari (dushanba-juma) hisobga
olinadi. Rasmiy bayram kunlari ham ish kuni hisoblanmaydi."

The deadline used to be `created_at + sla_hours` on the wall clock, so a
48-hour request filed on Friday evening expired on Sunday. Now only time that
falls on a working day counts: a working day contributes its full 24 hours,
while weekends and public holidays contribute nothing. A 48-hour service is
therefore two working days, which is how the catalogue's hours were meant.

Days are judged in the university's timezone, not UTC — a Monday that starts
at 00:00 in Tashkent starts at 19:00 on Sunday in UTC.
"""

from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import settings


@lru_cache
def _tz() -> ZoneInfo:
    return ZoneInfo(settings.sla_timezone)


@lru_cache
def _workdays() -> frozenset[int]:
    return frozenset(int(d) for d in settings.sla_workdays.split(",") if d.strip())


@lru_cache
def _fixed_holidays() -> frozenset[tuple[int, int]]:
    """Month/day pairs that are holidays every year (Navro'z, Mustaqillik...)."""
    pairs = set()
    for item in settings.sla_fixed_holidays.split(","):
        item = item.strip()
        if item:
            month, day = item.split("-")
            pairs.add((int(month), int(day)))
    return frozenset(pairs)


@lru_cache
def _dated_holidays() -> frozenset[date]:
    """One-off dates: the two Hayits and any transferred days off."""
    return frozenset(
        date.fromisoformat(item.strip())
        for item in settings.sla_holidays.split(",")
        if item.strip()
    )


def is_working_day(day: date) -> bool:
    if day.weekday() not in _workdays():
        return False
    if (day.month, day.day) in _fixed_holidays():
        return False
    return day not in _dated_holidays()


def _local_midnight_after(moment: datetime) -> datetime:
    local = moment.astimezone(_tz())
    next_day = local.date() + timedelta(days=1)
    return datetime(next_day.year, next_day.month, next_day.day, tzinfo=_tz())


def add_working_time(start: datetime, duration: timedelta) -> datetime:
    """The moment `duration` of working time has elapsed after `start`."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    remaining = duration
    cursor = start
    # Bounded so a misconfiguration (no working days at all) cannot hang.
    for _ in range(3660):
        day_end = _local_midnight_after(cursor)
        if is_working_day(cursor.astimezone(_tz()).date()):
            available = day_end - cursor
            if remaining <= available:
                return (cursor + remaining).astimezone(UTC)
            remaining -= available
        cursor = day_end
    raise ValueError("SLA calendar has no working days configured")


def working_time_between(start: datetime, end: datetime) -> timedelta:
    """Working time elapsed from `start` to `end`; zero if `end` is earlier."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    total = timedelta(0)
    cursor = start
    while cursor < end:
        day_end = min(_local_midnight_after(cursor), end)
        if is_working_day(cursor.astimezone(_tz()).date()):
            total += day_end - cursor
        cursor = day_end
    return total


def sla_deadline_from(start: datetime, sla_hours: int) -> datetime:
    return add_working_time(start, timedelta(hours=sla_hours))
