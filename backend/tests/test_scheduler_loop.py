"""Tests for the background reminder scheduler loop (backoff, recovery, thread offload, shutdown)."""
import asyncio
import logging
import threading

from app.services import reminder_scheduler as rs


class _FakeSession:
    def __enter__(self):
        return object()

    def __exit__(self, *exc):
        return False


def _factory():
    return _FakeSession()


def test_next_delay_normal_and_backoff_with_cap():
    assert rs.next_delay(0, 60, 900) == 60
    assert rs.next_delay(1, 60, 900) == 120
    assert rs.next_delay(2, 60, 900) == 240
    assert rs.next_delay(3, 60, 900) == 480
    assert rs.next_delay(4, 60, 900) == 900   # capped (would be 960)
    assert rs.next_delay(20, 60, 900) == 900


def test_loop_survives_failures_then_recovers_and_logs_sensibly(caplog):
    calls = {"n": 0}

    def flaky_cycle(db):
        calls["n"] += 1
        if calls["n"] <= 3:
            raise RuntimeError("Unknown column 'x'")

    async def run():
        task = asyncio.create_task(rs.scheduler_loop(_factory, 0.01, 0.05, cycle=flaky_cycle))
        for _ in range(200):
            await asyncio.sleep(0.02)
            if calls["n"] >= 5:
                break
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    with caplog.at_level(logging.INFO, logger=rs.logger.name):
        asyncio.run(run())

    assert calls["n"] >= 5, "loop must keep ticking after failures"
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(errors) == 1 and errors[0].exc_info, "full traceback logged once for a new error"
    assert len(warnings) == 2, "repeats of the same error get one short line each"
    assert any("recovered after 3" in r.getMessage() for r in caplog.records)


def test_changed_error_gets_a_new_traceback(caplog):
    seq = iter([RuntimeError("first"), RuntimeError("second"), None, None])
    calls = {"n": 0}

    def cycle(db):
        calls["n"] += 1
        item = next(seq, None)
        if item:
            raise item

    async def run():
        task = asyncio.create_task(rs.scheduler_loop(_factory, 0.01, 0.03, cycle=cycle))
        for _ in range(200):
            await asyncio.sleep(0.02)
            if calls["n"] >= 4:
                break
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    with caplog.at_level(logging.INFO, logger=rs.logger.name):
        asyncio.run(run())
    assert len([r for r in caplog.records if r.levelno == logging.ERROR]) == 2


def test_cycle_runs_off_the_event_loop_thread():
    seen = {}

    def cycle(db):
        seen["thread"] = threading.get_ident()

    async def run():
        main_thread = threading.get_ident()
        task = asyncio.create_task(rs.scheduler_loop(_factory, 0.01, 0.05, cycle=cycle))
        for _ in range(100):
            await asyncio.sleep(0.02)
            if "thread" in seen:
                break
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return main_thread

    main_thread = asyncio.run(run())
    assert seen["thread"] != main_thread


def test_cancellation_stops_loop_cleanly():
    async def run():
        task = asyncio.create_task(rs.scheduler_loop(_factory, 5, 5, cycle=lambda db: None))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return True
        return False

    assert asyncio.run(run()) is True
