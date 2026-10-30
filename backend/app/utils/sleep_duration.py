"""Computes sleep duration from bedtime/wake time, handling the overnight case (bedtime at
night, waking the next morning) - e.g. bedtime 23:00, wake_time 07:00 is 8 hours, not -16.
"""

from datetime import time


def compute_duration_hours(bedtime: time, wake_time: time) -> float:
    bed_minutes = bedtime.hour * 60 + bedtime.minute
    wake_minutes = wake_time.hour * 60 + wake_time.minute
    diff = wake_minutes - bed_minutes
    if diff <= 0:
        diff += 24 * 60  # crossed midnight
    return round(diff / 60, 2)
