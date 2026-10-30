import os

# Must be set before the app is imported. Tests run against a dedicated *_test database.
os.environ["ENVIRONMENT"] = "testing"
os.environ["EMAIL_BACKEND"] = "memory"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://hp_user:hp_password_123@localhost:3306/healthpredict_test"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-only-for-automated-tests-0123456789")
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing in tests

_db_name = os.environ["DATABASE_URL"].rsplit("/", 1)[-1].split("?")[0]
if not _db_name.endswith("_test"):
    raise RuntimeError(f"Refusing to run tests: database '{_db_name}' does not end with '_test'")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config.database import SessionLocal, engine
from app.main import app
from app.models import User, UserProfile, UserRole
from app.utils.email import clear_test_outbox, get_test_outbox
from app.utils.rate_limiter import reset_all_limiters
from app.utils.security import hash_password

PASSWORD = "Str0ng!Passw0rd"


@pytest.fixture()
def outbox():
    clear_test_outbox()
    yield get_test_outbox
    clear_test_outbox()


@pytest.fixture(scope="session", autouse=True)
def ensure_test_database_ready():
    """Ensure the test database has schema and all migrations applied automatically."""
    from app.utils.migration_runner import is_fresh_database, run_migrations
    try:
        if is_fresh_database(engine):
            run_migrations(engine)
    except Exception:
        # If connection fails at session start, let pure unit tests proceed
        pass


@pytest.fixture()
def clean_state():
    """Only pulled in by fixtures that actually need the database (client, db below) -
    pure unit tests (e.g. test_health_score.py) never touch the database at all."""
    reset_all_limiters()
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM users"))  # cascades to profiles and tokens
    except OperationalError as exc:
        if "doesn't exist" in str(exc).lower() or "no such table" in str(exc).lower():
            from app.utils.migration_runner import run_migrations
            run_migrations(engine)
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM users"))
        else:
            db_url = os.environ.get("DATABASE_URL", "")
            raise RuntimeError(
                f"\n\n============================================================\n"
                f"ERROR: Could not connect to test database at {db_url}!\n"
                f"Please ensure MySQL is running on that port, the database exists, and permissions are granted.\n"
                f"To point tests at a different port or database, set the TEST_DATABASE_URL environment variable:\n"
                f"  e.g. export TEST_DATABASE_URL='mysql+pymysql://hp_user:hp_password_123@localhost:3306/healthpredict_test'\n"
                f"Original error: {exc}\n"
                f"============================================================\n"
            ) from exc
    yield


@pytest.fixture()
def client(clean_state):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db(clean_state):
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def make_user(db):
    def _make(email="user@test.com", password=PASSWORD, role=UserRole.USER, active=True, name="Test User"):
        u = User(email=email, password_hash=hash_password(password), full_name=name, role=role, is_active=active)
        u.profile = UserProfile()
        db.add(u)
        db.commit()
        return u
    return _make


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.fixture()
def auth_headers(client, make_user):
    def _headers(email="user@test.com", role=UserRole.USER):
        make_user(email=email, role=role)
        token = login(client, email).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    return _headers
