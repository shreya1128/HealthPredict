"""Schema drift regression test.

Compares SQLAlchemy ORM models (Base.metadata.tables) against the live
database schema (information_schema.columns) to guarantee that schema.sql,
migrations, and the ORM models remain in 100% lockstep without silent drift.
"""

import pytest
from sqlalchemy import inspect, text

from app.config.database import Base, engine
import app.models  # noqa: F401 - ensure all models are imported and registered


def test_no_schema_drift_between_orm_and_database(db):
    """Verify every ORM model table and column exists in the actual database."""
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())

    # Ensure tables were actually created
    assert len(db_tables) > 0, "No tables found in test database - run schema.sql first"

    drift_errors = []

    for table_name, table in Base.metadata.tables.items():
        if table_name not in db_tables:
            drift_errors.append(f"Missing table in database: {table_name}")
            continue

        db_columns = {col["name"]: col for col in inspector.get_columns(table_name)}

        for col in table.columns:
            if col.name not in db_columns:
                drift_errors.append(
                    f"Missing column in database table '{table_name}': column '{col.name}'"
                )

    assert not drift_errors, (
        "Schema drift detected between ORM models and database schema:\n"
        + "\n".join(drift_errors)
    )


def test_database_has_no_orphan_tables():
    """Verify that every core application table in the database maps to an ORM model."""
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    orm_tables = set(Base.metadata.tables.keys())

    # Standard system or tracking tables that might not have an ORM model
    allowed_db_only = {"alembic_version", "schema_migrations"}

    extra_tables = db_tables - orm_tables - allowed_db_only
    # Any unexpected extra tables should be flagged
    assert not extra_tables, f"Database contains untracked tables: {extra_tables}"


def test_schema_sql_contains_all_migration_columns_and_tables():
    """Verify database/schema.sql stays 100% in lockstep with all migration files.
    Fails if a migration adds a table or column that is missing from schema.sql.
    """
    import re
    from pathlib import Path

    # Find project root
    current = Path(__file__).resolve().parent
    root = None
    for parent in [current] + list(current.parents):
        if (parent / "database" / "schema.sql").exists():
            root = parent
            break
    assert root is not None, "Could not find database/schema.sql"

    schema_sql = (root / "database" / "schema.sql").read_text(encoding="utf-8")
    migrations = sorted((root / "database" / "migrations").glob("*.sql"))
    assert len(migrations) > 0, "No migrations found to verify"

    drift_errors = []

    for mf in migrations:
        content = mf.read_text(encoding="utf-8")

        # 1. Check ALTER TABLE ... ADD [COLUMN] <col>
        # Strip comments
        lines = [l for l in content.splitlines() if not l.strip().startswith("--")]
        clean_content = "\n".join(lines)

        add_col_pattern = re.compile(
            r"ALTER\s+TABLE\s+[`\"]?(\w+)[`\"]?\s+ADD\s+(?:COLUMN\s+)?[`\"]?(\w+)[`\"]?",
            re.IGNORECASE,
        )
        for match in add_col_pattern.finditer(clean_content):
            table = match.group(1).lower()
            col = match.group(2).lower()
            # Find table block in schema.sql
            table_pattern = re.compile(
                r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"]?" + re.escape(table) + r"[`\"]?\s*\((.*?)\)\s*(?:ENGINE|;)",
                re.DOTALL | re.IGNORECASE,
            )
            t_match = table_pattern.search(schema_sql)
            if not t_match:
                drift_errors.append(f"Migration {mf.name} alters table '{table}', but table is not in schema.sql")
            else:
                table_body = t_match.group(1).lower()
                # Check column appears in the table definition
                col_pattern = re.compile(r"[`\"]?" + re.escape(col) + r"[`\"]?\s+", re.IGNORECASE)
                if not col_pattern.search(table_body):
                    drift_errors.append(
                        f"Migration {mf.name} adds column '{table}.{col}', but it is missing from database/schema.sql!"
                    )

        # 2. Check CREATE TABLE
        create_pattern = re.compile(
            r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"]?(\w+)[`\"]?",
            re.IGNORECASE,
        )
        for match in create_pattern.finditer(clean_content):
            table = match.group(1).lower()
            if table in ("schema_migrations", "alembic_version"):
                continue
            table_check = re.compile(
                r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"]?" + re.escape(table) + r"[`\"]?",
                re.IGNORECASE,
            )
            if not table_check.search(schema_sql):
                drift_errors.append(
                    f"Migration {mf.name} creates table '{table}', but table is missing from database/schema.sql!"
                )

    assert not drift_errors, (
        "Schema drift between migrations and database/schema.sql:\n"
        + "\n".join(f"  - {e}" for e in drift_errors)
    )


def test_schema_sql_covers_all_orm_tables_and_columns():
    """Verify database/schema.sql contains every table and column declared in SQLAlchemy ORM models."""
    import re
    from pathlib import Path

    current = Path(__file__).resolve().parent
    root = None
    for parent in [current] + list(current.parents):
        if (parent / "database" / "schema.sql").exists():
            root = parent
            break
    assert root is not None, "Could not find database/schema.sql"

    schema_sql = (root / "database" / "schema.sql").read_text(encoding="utf-8")
    drift_errors = []

    for tname, table in Base.metadata.tables.items():
        # Find table in schema_sql
        table_pattern = re.compile(
            r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"]?" + re.escape(tname) + r"[`\"]?\s*\((.*?)\)\s*(?:ENGINE|;)",
            re.DOTALL | re.IGNORECASE,
        )
        t_match = table_pattern.search(schema_sql)
        if not t_match:
            drift_errors.append(f"ORM table '{tname}' not defined in database/schema.sql")
            continue

        table_body = t_match.group(1).lower()
        for col in table.columns:
            # Check column definition in table
            col_pattern = re.compile(r"[`\"]?" + re.escape(col.name.lower()) + r"[`\"]?\s+", re.IGNORECASE)
            if not col_pattern.search(table_body):
                drift_errors.append(f"ORM column '{tname}.{col.name}' is missing from database/schema.sql definition")

    assert not drift_errors, (
        "Discrepancies found between ORM models and database/schema.sql:\n"
        + "\n".join(f"  - {d}" for d in drift_errors)
    )
