"""
Database session configuration for Supabase PostgreSQL.
"""
from collections.abc import AsyncGenerator

from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from app.core.config import settings

# Create async engine
# Note: statement_cache_size=0 is required for Supabase's pgbouncer (transaction mode)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,  # Set to False to disable query logging and improve performance
    future=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    connect_args={
        "statement_cache_size": 0,  # Required for pgbouncer transaction mode
        "prepared_statement_cache_size": 0,
    },
)

# Session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# --- Synchronous Support (psycopg2) ---
# Used primarily in background workers (Celery) for stability on Windows
sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
sync_engine = create_engine(
    sync_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    connect_args={
        "options": "-c statement_timeout=30000" # Optional: 30s timeout
    }
)

sync_session_factory = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables with safety against locking contention."""
    # 1. Create tables defined in SQLModel (metadata)
    # We do this in a separate block to avoid holding locks during subsequent checks
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    
    # 2. Add missing columns with short lock timeouts to avoid blocking the whole app
    # We use a new connection for each to ensure we don't hold a long transaction.
    async with engine.connect() as conn:
        # Set a short lock timeout (2 seconds) for this connection.
        # This prevents ALTER TABLE from waiting forever and blocking other queries.
        await conn.execute(text("SET lock_timeout = '2s'"))
        
        # Check and add 'github_profile' to 'cv_analysis'
        res = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='cv_analysis' AND column_name='github_profile'")
        )
        if not res.fetchone():
            try:
                await conn.execute(text("ALTER TABLE cv_analysis ADD COLUMN github_profile JSONB"))
                await conn.commit()
            except Exception:
                # If we couldn't get the lock in 2s, we skip it. It will try again on next startup.
                pass
                
        # Check and add 'jd_hdeval_qag' to 'positions'
        res = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='positions' AND column_name='jd_hdeval_qag'")
        )
        if not res.fetchone():
            try:
                await conn.execute(text("ALTER TABLE positions ADD COLUMN jd_hdeval_qag JSONB"))
                await conn.commit()
            except Exception:
                pass
