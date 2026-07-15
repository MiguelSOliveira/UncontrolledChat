"""Tests for src.websocket.ConnectionManager."""

import pytest

from src.websocket import ConnectionManager


class FakeSocket:
    """Minimal socket stub for ConnectionManager behavior tests."""

    def __init__(self, fail_send: bool = False) -> None:
        self.fail_send = fail_send
        self.accepted = False
        self.messages: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict) -> None:
        if self.fail_send:
            raise RuntimeError("send failed")
        self.messages.append(message)


@pytest.mark.asyncio
async def test_connect_accepts_socket_and_tracks_it() -> None:
    """Connecting a socket should accept it and append to active connections."""
    manager = ConnectionManager()
    socket = FakeSocket()

    await manager.connect(socket)

    assert socket.accepted is True
    assert manager.active_connections == [socket]


@pytest.mark.asyncio
async def test_broadcast_sends_to_all_active_connections() -> None:
    """Broadcast should send the payload to each connected socket."""
    manager = ConnectionManager()
    first = FakeSocket()
    second = FakeSocket()
    await manager.connect(first)
    await manager.connect(second)

    await manager.broadcast({"type": "message", "content": "x"})

    assert first.messages == [{"type": "message", "content": "x"}]
    assert second.messages == [{"type": "message", "content": "x"}]


@pytest.mark.asyncio
async def test_broadcast_disconnects_clients_that_fail_to_send() -> None:
    """Failed send should remove only the disconnected socket."""
    manager = ConnectionManager()
    healthy = FakeSocket()
    broken = FakeSocket(fail_send=True)
    await manager.connect(healthy)
    await manager.connect(broken)

    await manager.broadcast({"type": "message"})

    assert manager.active_connections == [healthy]
    assert healthy.messages == [{"type": "message"}]


@pytest.mark.asyncio
async def test_send_personal_message_ignores_send_failures() -> None:
    """Personal send should swallow socket errors without raising."""
    manager = ConnectionManager()
    broken = FakeSocket(fail_send=True)

    await manager.send_personal_message({"type": "message"}, broken)
