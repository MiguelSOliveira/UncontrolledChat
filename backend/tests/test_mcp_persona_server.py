"""Tests for MCP persona server tools."""

from typing import Any

from src import mcp_persona_server
from src.room_crypto import RoomCrypto


def test_list_personas_decrypts_backend_rows(monkeypatch) -> None:
    """Listing personas should decrypt and expose plaintext metadata."""
    room = RoomCrypto.from_passphrase("shared-pass")
    ciphertext = room.encrypt(
        '{"name":"Oracle","description":"Wise helper","invokedBy":"Agent"}'
    )

    def fake_request_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
        assert method == "GET"
        assert "key_space_id=" in url
        assert payload is None
        return [{"id": "persona-1", "ciphertext": ciphertext, "created_at": "2026-01-01T00:00:00"}]

    monkeypatch.setattr(mcp_persona_server, "_request_json", fake_request_json)

    personas = mcp_persona_server.list_personas(passphrase="shared-pass")

    assert personas == [
        {
            "id": "persona-1",
            "name": "Oracle",
            "description": "Wise helper",
            "invoked_by": "Agent",
            "created_at": "2026-01-01T00:00:00",
        }
    ]


def test_create_persona_encrypts_and_posts_payload(monkeypatch) -> None:
    """Creating a persona should send encrypted content to backend."""
    captured_payload: dict[str, Any] = {}

    def fake_request_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
        assert method == "POST"
        assert url.endswith("/api/personas")
        assert payload is not None
        captured_payload.update(payload)
        return {"id": "persona-2", "created_at": "2026-01-02T00:00:00"}

    monkeypatch.setattr(mcp_persona_server, "_request_json", fake_request_json)

    created = mcp_persona_server.create_persona(
        passphrase="shared-pass",
        name="Oracle",
        description="Wise helper",
    )

    room = RoomCrypto.from_passphrase("shared-pass")
    decrypted = room.decrypt(str(captured_payload["ciphertext"]))
    assert created["id"] == "persona-2"
    assert created["name"] == "Oracle"
    assert created["key_space_id"] == room.key_space_id
    assert captured_payload["name_token"] == room.persona_name_token("Oracle")
    assert '"name":"Oracle"' in decrypted
    assert '"description":"Wise helper"' in decrypted
    assert '"invokedBy":"Agent"' in decrypted


def test_create_persona_from_description_uses_existing_names(monkeypatch) -> None:
    """Generated persona requests should include decrypted existing names."""
    room = RoomCrypto.from_passphrase("shared-pass")
    existing_ciphertext = room.encrypt(
        '{"name":"Sage","description":"Old one","invokedBy":"Agent"}'
    )
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake_request_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
        calls.append((method, url, payload))
        if method == "GET":
            return [{"id": "persona-1", "ciphertext": existing_ciphertext, "created_at": "2026-01-01T00:00:00"}]
        if method == "POST" and url.endswith("/api/personas/generate"):
            return {"name": "Oracle"}
        if method == "POST" and url.endswith("/api/personas"):
            return {"id": "persona-2", "created_at": "2026-01-02T00:00:00"}
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr(mcp_persona_server, "_request_json", fake_request_json)

    created = mcp_persona_server.create_persona_from_description(
        passphrase="shared-pass",
        description="Wise helper",
    )

    generate_payload = calls[1][2]
    assert created["name"] == "Oracle"
    assert isinstance(generate_payload, dict)
    assert generate_payload["existing_names"] == ["Sage"]
