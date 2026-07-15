"""Room-key crypto helpers compatible with the frontend RoomKey implementation."""

import base64
import hashlib
import hmac
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

APP_SALT = b"uncontrolled-chat-v1"
PBKDF2_ITERATIONS = 200_000
AES_KEY_LEN_BYTES = 32
IV_LEN_BYTES = 12
KEY_SPACE_LABEL = b"uncontrolled-chat-key-space-v1"
PERSONA_PREFIX = "persona:"


def _derive_key_bytes(passphrase: str) -> bytes:
    """Derive deterministic key bytes from a passphrase using PBKDF2-SHA256."""
    return hashlib.pbkdf2_hmac(
        "sha256",
        passphrase.encode("utf-8"),
        APP_SALT,
        PBKDF2_ITERATIONS,
        dklen=AES_KEY_LEN_BYTES,
    )


@dataclass(frozen=True)
class RoomCrypto:
    """Passphrase-derived key material for Key Space identity and payload crypto."""

    _key_bytes: bytes

    @classmethod
    def from_passphrase(cls, passphrase: str) -> "RoomCrypto":
        """Create room crypto state from a plaintext passphrase."""
        if not passphrase:
            raise ValueError("Passphrase cannot be empty.")
        return cls(_derive_key_bytes(passphrase))

    @property
    def key_space_id(self) -> str:
        """Return the hex-encoded Key Space id for this passphrase."""
        signature = hmac.new(self._key_bytes, KEY_SPACE_LABEL, hashlib.sha256).digest()
        return signature.hex()

    def persona_name_token(self, name: str) -> str:
        """Return deterministic hex token for duplicate persona-name checks."""
        normalized = name.strip().lower()
        if not normalized:
            raise ValueError("Persona name cannot be empty.")
        signature = hmac.new(
            self._key_bytes,
            f"{PERSONA_PREFIX}{normalized}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return signature.hex()

    def encrypt(self, plaintext: str) -> str:
        """Encrypt text as base64(iv || aes-gcm-ciphertext)."""
        iv = os.urandom(IV_LEN_BYTES)
        ciphertext = AESGCM(self._key_bytes).encrypt(iv, plaintext.encode("utf-8"), associated_data=None)
        return base64.b64encode(iv + ciphertext).decode("ascii")

    def decrypt(self, payload: str) -> str:
        """Decrypt base64(iv || aes-gcm-ciphertext) to UTF-8 text."""
        combined = base64.b64decode(payload.encode("ascii"), validate=True)
        if len(combined) <= IV_LEN_BYTES:
            raise ValueError("Encrypted payload is invalid.")
        iv = combined[:IV_LEN_BYTES]
        ciphertext = combined[IV_LEN_BYTES:]
        plaintext = AESGCM(self._key_bytes).decrypt(iv, ciphertext, associated_data=None)
        return plaintext.decode("utf-8")
