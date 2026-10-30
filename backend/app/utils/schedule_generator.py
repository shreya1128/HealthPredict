"""Generates medicine dose dates/times from a medicine's frequency settings.

Pure function, no DB - easy to test exhaustively (see tests/test_schedule_generator.py).

Supported frequency_unit values:
  DAILY      - one dose per entry in time_of_day, every day. frequency must equal len(time_of_day)
               (validated at the schema level) so there's no ambiguity about dose count.
  WEEKLY     - one dose every 7 days, on start_date's weekday, at time_of_day[0]. `frequency`
               beyond 1 is not yet supported (e.g. "twice a week" needs specific weekdays, which
               the current data model has no field for) - documented limitation.
               **Extended**: When `weekdays` is provided (list of ISO weekday ints 0=Mon..6=Sun),
               doses are scheduled on all specified weekdays each week.
  MONTHLY    - one dose every 30 days from start_date (a fixed 30-day cadence, not calendar
               months, to avoid "Jan 31 + 1 month" ambiguity), at time_of_day[0].
               **Extended**: When `month_day` is provided (int 1-31), doses are scheduled on
               that specific calendar day each month.
  AS_NEEDED  - no schedule rows at all; intake is logged ad-hoc (see medicine_service.py).

The horizon is capped (MAX_HORIZON_DAYS) to keep the number of generated rows bounded; a
medicine with no end_date or a far-future one is only scheduled up to the cap from start_date,
not regenerated automatically later - documented limitation (see STATUS.md).
"""

import calendar
from datetime import date, datetime, time, timedelta

MAX_HORIZON_DAYS = 90


def _parse_time(s: str) -> time:
    return datetime.strptime(s, "%H:%M").time()


def generate_schedule(
    start_date: date, end_date: date | None, frequency_unit: str, time_of_day: list[str],
    today: date | None = None,
    weekdays: list[int] | None = None,
    month_day: int | None = None,
) -> list[tuple[date, time]]:
    """Returns [(date, time), ...] for all doses from start_date through the earlier of
    end_date and the horizon cap (today + MAX_HORIZON_DAYS, or start_date + cap if today is
    before start_date).

    weekdays: list of ISO weekday ints (0=Mon..6=Sun). For WEEKLY medicines, generates
              doses on all specified weekdays each week instead of every-7-days.
    month_day: int 1-31. For MONTHLY medicines, generates doses on this calendar day
               each month instead of every-30-days.
    """
    if frequency_unit == "AS_NEEDED":
        return []
    if not time_of_day:
        raise ValueError("time_of_day is required for a scheduled (non-AS_NEEDED) medicine")

    times = [_parse_time(t) for t in time_of_day]
    today = today or date.today()
    horizon = max(today, start_date) + timedelta(days=MAX_HORIZON_DAYS)
    effective_end = min(end_date, horizon) if end_date else horizon
    if effective_end < start_date:
        return []

    doses: list[tuple[date, time]] = []
    if frequency_unit == "DAILY":
        d = start_date
        while d <= effective_end:
            for t in times:
                doses.append((d, t))
            d += timedelta(days=1)
    elif frequency_unit == "WEEKLY":
        if weekdays and len(weekdays) > 0:
            # Complex weekly: specific weekdays (e.g., Mon/Wed/Fri)
            valid_weekdays = sorted(set(weekdays))
            d = start_date
            while d <= effective_end:
                if d.weekday() in valid_weekdays:
                    for t in times:
                        doses.append((d, t))
                d += timedelta(days=1)
        else:
            # Simple weekly: every 7 days from start_date
            d = start_date
            while d <= effective_end:
                doses.append((d, times[0]))
                d += timedelta(days=7)
    elif frequency_unit == "MONTHLY":
        if month_day is not None and 1 <= month_day <= 31:
            # Calendar-month cadence: on a specific day-of-month each month
            year, month = start_date.year, start_date.month
            while True:
                last_day = calendar.monthrange(year, month)[1]
                target_day = min(month_day, last_day)
                d = date(year, month, target_day)
                if d > effective_end:
                    break
                if d >= start_date:
                    for t in times:
                        doses.append((d, t))
                # Advance to next month
                if month == 12:
                    year += 1
                    month = 1
                else:
                    month += 1
        else:
            # Simple monthly: fixed 30-day cadence
            d = start_date
            while d <= effective_end:
                doses.append((d, times[0]))
                d += timedelta(days=30)
    else:
        raise ValueError(f"Unknown frequency_unit: {frequency_unit}")

    return doses
