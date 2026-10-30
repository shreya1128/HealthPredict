"""SQLAlchemy engine/session setup.

database/schema.sql owns the MySQL DDL; the app never calls create_all against MySQL.
"""

import logging
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config.settings import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

_engine_kwargs: dict = {"echo": settings.DB_ECHO, "pool_pre_ping": True}

if not settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600
    )

if settings.DB_SSL_CA:
    _engine_kwargs["connect_args"] = {
        "ssl": {"ca": settings.DB_SSL_CA}
    }

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


@event.listens_for(engine, "connect")
def _set_mysql_mode(dbapi_conn, _record):
    """Strict SQL mode on MySQL/MariaDB so bad data errors instead of being truncated."""
    if engine.dialect.name in ("mysql", "mariadb"):
        cur = dbapi_conn.cursor()
        cur.execute("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'")
        cur.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("Database connection failed: %s", exc)
        return False
