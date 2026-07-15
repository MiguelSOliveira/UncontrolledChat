"""Behavior tests for src.main API routes and websocket endpoint."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocketDisconnect
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src import main
from src.database import get_all_messages, save_message, save_participant


class FakeWebSocket:
    """Minimal websocket double for endpoint flow tests."""

    def __init__(self, incoming: list[dict] | None = None) -> None:
        self.accepted = False
        self.closed: tuple[int, str] | None = None
        self.incoming = list(incoming or [])
        self.sent: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int, reason: str) -> None:
        self.closed = (code, reason)

    async def receive_json(self) -> dict:
        if self.incoming:
            return self.incoming.pop(0)
        raise WebSocketDisconnect

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)


@pytest.mark.asyncio
async def test_create_participant_rejects_blank_username(client: AsyncClient) -> None:
    """POST /api/participants should reject empty usernames."""
    response = await client.post("/api/participants", params={"username": "   "})

    assert response.status_code == 400
    assert response.json()["detail"] == "Username cannot be empty"


@pytest.mark.asyncio
async def test_create_participant_trims_username(client: AsyncClient) -> None:
    """POST /api/participants should return participant with stripped username."""
    response = await client.post("/api/participants", params={"username": "  alice  "})

    payload = response.json()
    assert response.status_code == 200
    assert payload["username"] == "alice"
    assert len(payload["id"]) == 32
    assert payload["joined_at"]


@pytest.mark.asyncio
async def test_get_messages_returns_persisted_messages(db_session: AsyncSession, client: AsyncClient) -> None:
    """GET /api/messages should include persisted rows."""
    created_at = datetime.now(timezone.utc)
    await save_message(db_session, "m1", "ciphertext-1", "u1", "alice", created_at)

    response = await client.get("/api/messages")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == "m1"
    assert payload[0]["content"] == "ciphertext-1"
    assert payload[0]["user_id"] == "u1"
    assert payload[0]["username"] == "alice"
    assert payload[0]["created_at"].startswith(created_at.strftime("%Y-%m-%dT%H:%M"))


@pytest.mark.asyncio
async def test_delete_messages_clears_store_and_broadcasts_clear_event(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    """DELETE /api/messages should wipe DB and emit clear event."""
    created_at = datetime.now(timezone.utc)
    await save_message(db_session, "m1", "ciphertext-1", "u1", "alice", created_at)
    broadcast_spy = AsyncMock()
    main.manager.broadcast = broadcast_spy

    response = await client.delete("/api/messages")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    broadcast_spy.assert_awaited_once_with({"type": "clear"})
    rows = await get_all_messages(db_session)
    assert rows == []


@pytest.mark.asyncio
async def test_trigger_news_calls_single_news_fetch(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /api/news should call bot fetch once and return ok."""
    fetch_mock = AsyncMock()
    monkeypatch.setattr(main, "news_fetch_one", fetch_mock)

    response = await client.post("/api/news")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    fetch_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_trigger_crypto_calls_single_btc_fetch(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /api/crypto should call bot fetch once and return ok."""
    fetch_mock = AsyncMock()
    monkeypatch.setattr(main, "btc_fetch_one", fetch_mock)

    response = await client.post("/api/crypto")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    fetch_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_websocket_endpoint_closes_unknown_participant() -> None:
    """Unknown participant should be rejected with policy-violation close code."""
    websocket = FakeWebSocket()

    await main.websocket_endpoint(websocket, "missing-participant")

    assert websocket.closed == (1008, "Participant not found")
    assert websocket.accepted is False


@pytest.mark.asyncio
async def test_websocket_endpoint_broadcasts_join_message_leave_and_persists_message(
    db_session: AsyncSession,
) -> None:
    """Valid websocket session should broadcast join/message/leave and store text messages."""
    await save_participant(db_session, "p1", "alice", datetime.now(timezone.utc))
    websocket = FakeWebSocket(incoming=[{"type": "message", "content": "  encrypted  "}])

    await main.websocket_endpoint(websocket, "p1")

    assert websocket.accepted is True
    sent_types = [msg["type"] for msg in websocket.sent]
    assert sent_types[0] == "user_joined"
    assert "message" in sent_types
    assert main.manager.active_connections == []

    rows = await get_all_messages(db_session)
    assert len(rows) == 1
    assert rows[0].content == "encrypted"


@pytest.mark.asyncio
async def test_websocket_endpoint_relays_media_without_persisting(
    db_session: AsyncSession,
) -> None:
    """Media events should be broadcast but not stored in the messages table."""
    await save_participant(db_session, "p2", "bob", datetime.now(timezone.utc))
    websocket = FakeWebSocket(
        incoming=[
            {
                "type": "media",
                "id": "media-1",
                "ciphertext": "abc123",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    )

    await main.websocket_endpoint(websocket, "p2")

    media_events = [payload for payload in websocket.sent if payload.get("type") == "media"]
    assert len(media_events) == 1
    assert media_events[0]["ciphertext"] == "abc123"

    rows = await get_all_messages(db_session)
    assert rows == []
