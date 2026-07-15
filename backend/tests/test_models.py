"""Tests for src.models."""

from datetime import datetime

from src.models import Message, Participant


def test_participant_defaults_create_id_and_timestamp() -> None:
    """Participant should auto-generate id and joined timestamp."""
    participant = Participant(username="alice")

    assert participant.username == "alice"
    assert len(participant.id) == 32
    assert isinstance(participant.joined_at, datetime)


def test_message_to_dict_serializes_iso_created_at() -> None:
    """Message serialization should include all wire fields and ISO timestamp."""
    message = Message(content="hello", user_id="u1", username="alice")

    payload = message.to_dict()

    assert payload["id"] == message.id
    assert payload["content"] == "hello"
    assert payload["user_id"] == "u1"
    assert payload["username"] == "alice"
    assert payload["created_at"] == message.created_at.isoformat()
