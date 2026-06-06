from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from config import settings
from hashing import hash_password
from models import Base

# ── SQLite (master portal users) ────────────────────────────────────────────
sqlite_engine = create_engine(
    settings.SQLITE_URL,
    connect_args={"check_same_thread": False},
)
SyncSessionLocal = sessionmaker(bind=sqlite_engine, autocommit=False, autoflush=False)


def get_sqlite_session() -> Generator[Session, None, None]:
    session = SyncSessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_sqlite() -> None:
    Base.metadata.create_all(bind=sqlite_engine)
    from models import MasterUser
    with SyncSessionLocal() as s:
        if not s.query(MasterUser).filter_by(username="admin").first():
            s.add(MasterUser(username="admin", password_hash=hash_password("1234")))
            s.commit()


# ── Supabase (organizations) — sync psycopg2 ────────────────────────────────
# asyncpg has a Supavisor tenant-routing issue on this environment;
# psycopg2 (already in requirements.txt) avoids it without any loss of
# functionality for a low-traffic admin portal.
_pg_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

pg_engine = create_engine(
    _pg_url,
    pool_size=3,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=240,
)
PgSessionLocal = sessionmaker(bind=pg_engine, autocommit=False, autoflush=False)


def get_pg_session() -> Generator[Session, None, None]:
    session = PgSessionLocal()
    try:
        yield session
    finally:
        session.close()
