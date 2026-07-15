"""Tests for src.database helpers."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import (
    clear_messages,
    get_all_messages,
    get_participant,
    save_message,
    save_participant,
)


@pytest.mark.asyncio
async def test_save_participant_and_get_participant_returns_row(db_session: AsyncSession) -> None:
    """Saved participant should be retrievable by id."""
    joined_at = datetime.now(timezone.utc)
    await save_participant(db_session, "p1", "alice", joined_at)

    row = await get_participant(db_session, "p1")

    assert row is not None
    assert row.id == "p1"
    assert row.username == "alice"


@pytest.mark.asyncio
async def test_get_participant_unknown_id_returns_none(db_session: AsyncSession) -> None:
    """Unknown participant id should return None."""
    row = await get_participant(db_session, "missing")

    assert row is None


@pytest.mark.asyncio
async def test_get_all_messages_returns_rows_in_created_order(db_session: AsyncSession) -> None:
    """Messages should be returned in ascending created_at order."""
    base = datetime.now(timezone.utc)
    await save_message(db_session, "m2", "second", "u1", "alice", base + timedelta(seconds=1))
    await save_message(db_session, "m1", "first", "u1", "alice", base)

    rows = await get_all_messages(db_session)

    assert [row.id for row in rows] == ["m1", "m2"]
    assert [row.content for row in rows] == ["first", "second"]


@pytest.mark.asyncio
async def test_clear_messages_removes_all_rows(db_session: AsyncSession) -> None:
    """Clear helper should delete all persisted messages."""
    now = datetime.now(timezone.utc)
    await save_message(db_session, "m1", "hello", "u1", "alice", now)

    await clear_messages(db_session)
    rows = await get_all_messages(db_session)

    assert rows == []
