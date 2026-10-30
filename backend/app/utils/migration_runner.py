"""Database Migration Runner.

Provides a reproducible, idempotent initialization and upgrade workflow:
- Detects fresh databases vs existing databases.
- Creates all tables including screenings on a fresh database.
- Tracks applied migrations in `schema_migrations` table.
- Applies pending migrations in strict alphanumeric order.
- Runs automatically during application startup (in Docker and local).
"""

import glob
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def get_project_root() -> Path:
    """Find the root HealthPredict directory containing database/."""
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / "database" / "schema.sql").exists():
            return parent
    return Path(os.getcwd())


def init_migrations_table(engine: Engine) -> None:
    """Ensure the schema_migrations tracking table exists."""
    ddl = """
    CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `migration_name` VARCHAR(255) PRIMARY KEY,
        `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def get_applied_migrations(engine: Engine) -> set[str]:
    """Return set of applied migration names."""
    init_migrations_table(engine)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT migration_name FROM schema_migrations")).fetchall()
        return {r[0] for r in rows}


def is_fresh_database(engine: Engine) -> bool:
    """Check if users table is missing (indicating an uninitialized database)."""
    with engine.connect() as conn:
        try:
            result = conn.execute(text("SHOW TABLES LIKE 'users'")).fetchone()
            return result is None
        except Exception:
            return True


def execute_sql_file(engine: Engine, filepath: Path) -> None:
    """Execute raw SQL statements from a file using individual statement chunks."""
    with open(filepath, "r", encoding="utf-8") as f:
        sql = f.read()

    # Split into discrete statements on semicolons while respecting multiline
    raw_statements = sql.split(";")
    with engine.begin() as conn:
        for stmt in raw_statements:
            cleaned = stmt.strip()
            # Ignore empty blocks or comments-only lines
            lines = [l for l in cleaned.splitlines() if not l.strip().startswith("--")]
            real_sql = "\n".join(lines).strip()
            if real_sql:
                try:
                    conn.execute(text(real_sql))
                except Exception as exc:
                    # Ignore duplicate column / constraint errors if re-running additive migrations
                    exc_str = str(exc).lower()
                    if any(k in exc_str for k in (
                        "duplicate column",
                        "duplicate key",
                        "already exists",
                        "duplicate foreign key",
                        "duplicate entry",
                        "can't drop",
                        "check that column/key exists",
                        "multiple primary key",
                    )):
                        logger.warning(f"Ignored already applied column/index/drop in {filepath.name}: {exc}")
                    else:
                        raise


def run_migrations(engine: Engine) -> Tuple[int, List[str]]:
    """
    Run initialization and pending migrations.
    Returns (applied_count, list_of_applied_migration_names).
    """
    root = get_project_root()
    schema_sql = root / "database" / "schema.sql"
    migrations_dir = root / "database" / "migrations"

    applied = get_applied_migrations(engine)
    migration_files = sorted(migrations_dir.glob("*.sql"))

    newly_applied = []

    # 1. Fresh database case: run schema.sql and mark all current migrations as applied
    if is_fresh_database(engine):
        logger.info("Fresh database detected. Initializing from database/schema.sql...")
        if schema_sql.exists():
            execute_sql_file(engine, schema_sql)
            init_migrations_table(engine)
            with engine.begin() as conn:
                now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                for mf in migration_files:
                    conn.execute(
                        text("INSERT IGNORE INTO schema_migrations (migration_name, applied_at) VALUES (:m, :t)"),
                        {"m": mf.name, "t": now_str},
                    )
                    newly_applied.append(mf.name)
            logger.info(f"Database initialized with {len(newly_applied)} migrations recorded.")
            verify_schema_integrity(engine)
            return len(newly_applied), newly_applied

    # 2. Existing database case: apply any migrations not yet tracked
    for mf in migration_files:
        if mf.name not in applied:
            logger.info(f"Applying migration: {mf.name}")
            execute_sql_file(engine, mf)
            with engine.begin() as conn:
                now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                conn.execute(
                    text("INSERT INTO schema_migrations (migration_name, applied_at) VALUES (:m, :t)"),
                    {"m": mf.name, "t": now_str},
                )
            newly_applied.append(mf.name)
            logger.info(f"Successfully applied migration: {mf.name}")

    verify_schema_integrity(engine)
    return len(newly_applied), newly_applied


def verify_schema_integrity(engine: Engine) -> None:
    """Verify that every ORM model table and column exists in the database.
    Raises RuntimeError if any drift is detected.
    """
    from sqlalchemy import inspect
    from app.config.database import Base
    import app.models  # noqa: F401 - ensure all models are registered

    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    missing = []
    for tname, table in Base.metadata.tables.items():
        if tname not in db_tables:
            missing.append(f"Table missing: {tname}")
            continue
        cols = {c["name"] for c in inspector.get_columns(tname)}
        for col in table.columns:
            if col.name not in cols:
                missing.append(f"Column missing in '{tname}': '{col.name}'")

    if missing:
        error_msg = f"Database schema integrity check failed with {len(missing)} missing items:\n" + "\n".join(f"  - {m}" for m in missing)
        logger.error(error_msg)
        raise RuntimeError(error_msg)


if __name__ == "__main__":
    from app.config.database import engine
    count, applied_list = run_migrations(engine)
    print(f"Migrations run completed. Applied {count} migrations: {applied_list}")
