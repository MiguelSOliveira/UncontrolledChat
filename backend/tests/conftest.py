"""Shared pytest fixtures for backend tests."""

from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src import database, main
from src.database import Base
from src.websocket import ConnectionManager


@pytest_asyncio.fixture()
async def test_engine() -> AsyncIterator[AsyncEngine]:
    """Provide an isolated in-memory database engine for a single test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.fixture()
def session_factory(test_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Provide session factory bound to the test database."""
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def override_app_dependencies(
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[None]:
    """Override DB access and reset websocket manager for every test."""

    async def _get_test_session() -> AsyncSession:
        return session_factory()

    monkeypatch.setattr(database, "get_session", _get_test_session)
    monkeypatch.setattr(main, "get_session", _get_test_session)
    main.manager = ConnectionManager()
    yield


@pytest_asyncio.fixture()
async def db_session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """Provide a direct async DB session for persistence assertions."""
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture()
async def client() -> AsyncIterator[AsyncClient]:
    """Provide async HTTP client bound to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=main.app),
        base_url="http://test",
    ) as async_client:
        yield async_client


@pytest.fixture()
def async_factory() -> Callable[[Any], Any]:
    """Wrap values into awaitable callables for monkeypatching async dependencies."""

    async def _wrapped(value: Any) -> Any:
        return value

    return _wrapped
