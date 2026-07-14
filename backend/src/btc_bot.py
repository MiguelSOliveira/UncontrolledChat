"""Background task that broadcasts an encrypted BTC price update every minute.

The bot encrypts each message with the hardcoded passphrase ``banana`` using
the same AES-GCM / PBKDF2 scheme as the frontend (see ``frontend/src/crypto/
roomKey.ts``), so users who joined the room with the ``banana`` passphrase
can decrypt the bot's messages and everyone else sees the standard
"unreadable" placeholder.
"""

import asyncio
import base64
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .websocket import ConnectionManager

logger = logging.getLogger(__name__)

BTC_PRICE_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=bitcoin&vs_currencies=usd"
)
BOT_USERNAME = "CryptoBro"
BOT_USER_ID = "cryptobro"
BOT_PASSPHRASE = "banana"
POLL_INTERVAL_SECONDS = 60
REQUEST_TIMEOUT_SECONDS = 10

# Must match the frontend's RoomKey scheme.
_APP_SALT = b"uncontrolled-chat-v1"
_PBKDF2_ITERATIONS = 200_000
_AES_KEY_BYTES = 32
_IV_BYTES = 12


def _derive_key(passphrase: str) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        passphrase.encode("utf-8"),
        _APP_SALT,
        _PBKDF2_ITERATIONS,
        dklen=_AES_KEY_BYTES,
    )


def _encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt with AES-GCM, returning base64(iv || ciphertext_with_tag)."""
    iv = os.urandom(_IV_BYTES)
    ct = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)

    return base64.b64encode(iv + ct).decode("ascii")


def _fetch_price_sync() -> float:
    req = Request(BTC_PRICE_URL, headers={"User-Agent": "UncontrolledChat/1.0"})
    with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    return float(payload["bitcoin"]["usd"])


async def fetch_btc_price() -> Optional[float]:
    try:
        return await asyncio.to_thread(_fetch_price_sync)
    except Exception as e:  # noqa: BLE001 — best-effort background task
        logger.warning(f"BTC price fetch failed: {e}")
        return None


def _format_message(current: float, previous: Optional[float]) -> str:
    if previous is None:
        return f"BTC ${current:,.2f} — baseline set. Watching the next tick..."

    delta = current - previous
    pct = (delta / previous) * 100 if previous else 0.0

    if delta >= 0:
        return (
            f"BTC ${current:,.2f} ▲ +${delta:,.2f} ({pct:+.2f}%) — "
            "🚀 IT'S PUMPING! BUY NOW before you miss the rocket!"
        )

    return (
        f"BTC ${current:,.2f} ▼ ${delta:,.2f} ({pct:+.2f}%) — "
        "🔥 SELL NOW! DUMP EVERYTHING BEFORE IT'S TOO LATE!!!"
    )


def _build_broadcast(ciphertext: str) -> dict:
    return {
        "type": "message",
        "id": uuid.uuid4().hex,
        "user_id": BOT_USER_ID,
        "username": BOT_USERNAME,
        "content": ciphertext,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def run_btc_bot(manager: ConnectionManager) -> None:
    """Poll the BTC price every minute and broadcast encrypted updates.

    Messages are encrypted with the ``banana`` passphrase and broadcast as
    normal chat messages (not persisted, so bot chatter doesn't clutter
    history on reload).
    """
    key = _derive_key(BOT_PASSPHRASE)
    previous_price: Optional[float] = None
    logger.info("BTC bot started (polling every %ss).", POLL_INTERVAL_SECONDS)

    while True:
        try:
            current = await fetch_btc_price()
            if current is not None:
                plaintext = _format_message(current, previous_price)
                ciphertext = _encrypt(plaintext, key)
                await manager.broadcast(_build_broadcast(ciphertext))
                previous_price = current
        except asyncio.CancelledError:
            logger.info("BTC bot stopping.")
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception(f"BTC bot iteration failed: {e}")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
