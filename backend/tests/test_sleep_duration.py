from datetime import time

import pytest

from app.utils.sleep_duration import compute_duration_hours


class TestSleepDuration:
    def test_same_day_sleep_not_crossing_midnight(self):
        # e.g. a nap: 13:00 to 14:30
        assert compute_duration_hours(time(13, 0), time(14, 30)) == 1.5

    def test_typical_overnight_sleep(self):
        assert compute_duration_hours(time(23, 0), time(7, 0)) == 8.0

    def test_overnight_crossing_with_minutes(self):
        assert compute_duration_hours(time(22, 45), time(6, 15)) == 7.5

    def test_bedtime_after_midnight(self):
        assert compute_duration_hours(time(0, 30), time(8, 30)) == 8.0

    def test_very_short_sleep(self):
        assert compute_duration_hours(time(23, 50), time(0, 10)) == pytest.approx(0.33, abs=0.01)

    def test_identical_times_treated_as_full_24h_cycle(self):
        assert compute_duration_hours(time(8, 0), time(8, 0)) == 24.0

    def test_result_rounded_to_two_decimals(self):
        d = compute_duration_hours(time(23, 13), time(6, 47))
        assert d == round(d, 2)
