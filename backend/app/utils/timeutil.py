from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC datetime (matches MySQL DATETIME columns; avoids deprecated datetime.utcnow)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
