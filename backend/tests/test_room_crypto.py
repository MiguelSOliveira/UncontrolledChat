"""Tests for room crypto compatibility helpers."""

import json

from src.room_crypto import RoomCrypto


def test_room_crypto_derives_stable_key_space_id() -> None:
    """Equal passphrases should derive the same Key Space id."""
    room_a = RoomCrypto.from_passphrase("top-secret")
    room_b = RoomCrypto.from_passphrase("top-secret")
    room_c = RoomCrypto.from_passphrase("another-secret")

    assert room_a.key_space_id == room_b.key_space_id
    assert room_a.key_space_id != room_c.key_space_id
    assert len(room_a.key_space_id) == 64


def test_room_crypto_encrypt_decrypt_roundtrip() -> None:
    """Payload encryption should roundtrip exactly with the same passphrase."""
    room = RoomCrypto.from_passphrase("group-passphrase")
    plaintext = json.dumps({"name": "Oracle", "invokedBy": "Agent"})

    payload = room.encrypt(plaintext)

    assert room.decrypt(payload) == plaintext


def test_persona_name_token_is_trimmed_and_case_insensitive() -> None:
    """Name token generation should normalize whitespace and case."""
    room = RoomCrypto.from_passphrase("shared")

    token_a = room.persona_name_token("Oracle")
    token_b = room.persona_name_token(" oracle ")
    token_c = room.persona_name_token("Sage")

    assert token_a == token_b
    assert token_a != token_c
    assert len(token_a) == 64
