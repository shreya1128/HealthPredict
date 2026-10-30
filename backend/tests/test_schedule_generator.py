from datetime import date, time

import pytest

from app.utils.schedule_generator import MAX_HORIZON_DAYS, generate_schedule


class TestAsNeeded:
    def test_no_schedule_rows(self):
        assert generate_schedule(date(2026, 1, 1), None, "AS_NEEDED", []) == []
        assert generate_schedule(date(2026, 1, 1), None, "AS_NEEDED", ["08:00"]) == []


class TestDaily:
    def test_single_dose_per_day_for_three_days(self):
        start = date(2026, 1, 1)
        end = date(2026, 1, 3)
        doses = generate_schedule(start, end, "DAILY", ["08:00"], today=start)
        assert doses == [
            (date(2026, 1, 1), time(8, 0)), (date(2026, 1, 2), time(8, 0)), (date(2026, 1, 3), time(8, 0)),
        ]

    def test_multiple_doses_per_day(self):
        start = date(2026, 1, 1)
        doses = generate_schedule(start, start, "DAILY", ["08:00", "14:00", "20:00"], today=start)
        assert doses == [
            (start, time(8, 0)), (start, time(14, 0)), (start, time(20, 0)),
        ]

    def test_inclusive_of_both_start_and_end_date(self):
        doses = generate_schedule(date(2026, 1, 1), date(2026, 1, 1), "DAILY", ["09:00"], today=date(2026, 1, 1))
        assert len(doses) == 1

    def test_missing_time_of_day_raises(self):
        with pytest.raises(ValueError, match="time_of_day is required"):
            generate_schedule(date(2026, 1, 1), None, "DAILY", [])

    def test_no_end_date_capped_at_horizon(self):
        start = date(2026, 1, 1)
        doses = generate_schedule(start, None, "DAILY", ["08:00"], today=start)
        assert len(doses) == MAX_HORIZON_DAYS + 1  # inclusive of day 0
        assert doses[-1][0] == start.fromordinal(start.toordinal() + MAX_HORIZON_DAYS)

    def test_end_date_before_start_date_gives_empty_list(self):
        assert generate_schedule(date(2026, 1, 10), date(2026, 1, 1), "DAILY", ["08:00"]) == []

    def test_horizon_measured_from_today_not_start_date_for_a_future_medicine(self):
        """A medicine starting far in the future shouldn't front-load 90 days from start_date
        if 'today' is still well before it - horizon is max(today, start_date) + cap."""
        today = date(2026, 1, 1)
        start = date(2026, 6, 1)  # far future start, no end date
        doses = generate_schedule(start, None, "DAILY", ["08:00"], today=today)
        # horizon = max(today, start) + 90 = start + 90 (since start > today)
        assert doses[-1][0] == start.fromordinal(start.toordinal() + MAX_HORIZON_DAYS)

    def test_past_medicine_still_generates_forward_from_today(self):
        """A long-running medicine (start_date in the past, no end_date) generates up to
        today + horizon, not stuck 90 days after its original start."""
        today = date(2026, 6, 1)
        start = date(2025, 1, 1)  # started long ago
        doses = generate_schedule(start, None, "DAILY", ["08:00"], today=today)
        assert doses[-1][0] == today.fromordinal(today.toordinal() + MAX_HORIZON_DAYS)
        assert doses[0][0] == start  # still starts from the original start_date


class TestWeekly:
    def test_one_dose_every_seven_days_on_start_weekday(self):
        start = date(2026, 1, 5)  # a Monday
        end = date(2026, 1, 26)
        doses = generate_schedule(start, end, "WEEKLY", ["09:00"], today=start)
        assert [d for d, _ in doses] == [date(2026, 1, 5), date(2026, 1, 12), date(2026, 1, 19), date(2026, 1, 26)]
        assert all(d.weekday() == start.weekday() for d, _ in doses)

    def test_uses_only_the_first_time_of_day_for_simple_weekly(self):
        doses = generate_schedule(date(2026, 1, 5), date(2026, 1, 5), "WEEKLY", ["09:00", "21:00"], today=date(2026, 1, 5))
        assert doses == [(date(2026, 1, 5), time(9, 0))]

    def test_complex_weekly_on_specific_weekdays(self):
        # Mon (0), Wed (2), Fri (4) from Monday Jan 5 to Sunday Jan 11 (1 week)
        start = date(2026, 1, 5)
        end = date(2026, 1, 11)
        doses = generate_schedule(start, end, "WEEKLY", ["08:00"], today=start, weekdays=[0, 2, 4])
        assert [d for d, _ in doses] == [date(2026, 1, 5), date(2026, 1, 7), date(2026, 1, 9)]
        assert all(t == time(8, 0) for _, t in doses)


class TestMonthly:
    def test_thirty_day_cadence(self):
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)
        doses = generate_schedule(start, end, "MONTHLY", ["10:00"], today=start)
        dates = [d for d, _ in doses]
        assert dates == [date(2026, 1, 1), date(2026, 1, 31), date(2026, 3, 2), date(2026, 4, 1)]  # fixed 30-day steps

    def test_calendar_day_monthly_cadence(self):
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)
        doses = generate_schedule(start, end, "MONTHLY", ["10:00"], today=start, month_day=1)
        dates = [d for d, _ in doses]
        assert dates == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1), date(2026, 4, 1)]

    def test_calendar_day_clamps_for_shorter_months(self):
        # 31st of each month: Jan 31 -> Feb 28 -> Mar 31
        start = date(2026, 1, 15)
        end = date(2026, 3, 31)
        doses = generate_schedule(start, end, "MONTHLY", ["09:00"], today=start, month_day=31)
        dates = [d for d, _ in doses]
        assert dates == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)]


class TestUnknownFrequencyUnit:
    def test_raises(self):
        with pytest.raises(ValueError, match="Unknown frequency_unit"):
            generate_schedule(date(2026, 1, 1), None, "FORTNIGHTLY", ["08:00"])
