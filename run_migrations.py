#!/usr/bin/env python3
"""CLI Entry point for HealthPredict database migrations."""
import sys
import os

# Ensure backend package is in Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.config.database import engine
from app.utils.migration_runner import run_migrations

if __name__ == "__main__":
    try:
        count, applied = run_migrations(engine)
        print(f"Applied {count} migrations: {applied}")
    except Exception as exc:
        print(f"MIGRATION ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
