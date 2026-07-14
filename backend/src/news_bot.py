"""Background task that broadcasts the latest BBC News headline every minute.

Uses the BBC RSS feed (free, no API key required).  Each headline is encrypted
with the ``banana`` passphrase using the same AES-GCM / PBKDF2 scheme as the
frontend so only users who joined with that passphrase can read it.
"""

import asyncio
import base64
import hashlib
import logging
import os
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .websocket import ConnectionManager

logger = logging.getLogger(__name__)

BBC_RSS_URL = "https://feeds.bbci.co.uk/news/rss.xml"
BOT_USERNAME = "BBCNewsBot"
BOT_USER_ID = "bbcnewsbot"
BOT_PASSPHRASE = "banana"
POLL_INTERVAL_SECONDS = 60
REQUEST_TIMEOUT_SECONDS = 10

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
    iv = os.urandom(_IV_BYTES)
    ct = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(iv + ct).decode("ascii")


def _fetch_headlines_sync() -> list[str]:
    req = Request(BBC_RSS_URL, headers={"User-Agent": "UncontrolledChat/1.0"})
    with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        root = ET.fromstring(resp.read().decode("utf-8"))
    return [
        item.findtext("title", "").strip()
        for item in root.findall(".//item")
        if item.findtext("title", "").strip()
    ]


async def _fetch_headlines() -> list[str]:
    try:
        return await asyncio.to_thread(_fetch_headlines_sync)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"BBC RSS fetch failed: {e}")
        return []


def _build_broadcast(ciphertext: str) -> dict:
    return {
        "type": "message",
        "id": uuid.uuid4().hex,
        "user_id": BOT_USER_ID,
        "username": BOT_USERNAME,
        "content": ciphertext,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


INITIAL_DELAY_SECONDS = 30  # offset from BTC bot so they don't fire simultaneously


async def run_news_bot(manager: ConnectionManager) -> None:
    """Fetch the latest BBC headline every minute and broadcast it encrypted.

    Starts 30 s after launch so it interleaves with the BTC bot instead of
    firing at the same time (BTC fires at t=0,60,120… news at t=30,90,150…).
    """
    logger.info(
        "News bot waiting %ss before first tick (stagger vs BTC bot).",
        INITIAL_DELAY_SECONDS,
    )
    await asyncio.sleep(INITIAL_DELAY_SECONDS)
    logger.info("News bot started (polling every %ss).", POLL_INTERVAL_SECONDS)

    while True:
        try:
            await fetch_and_broadcast_one(manager)
        except asyncio.CancelledError:
            logger.info("News bot stopping.")
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception(f"News bot iteration failed: {e}")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


# Shared state — used by both the periodic loop and the on-demand endpoint
_bot_key: bytes = _derive_key(BOT_PASSPHRASE)
_bot_seen: set[str] = set()
_bot_queue: list[str] = []


async def fetch_and_broadcast_one(manager: ConnectionManager) -> None:
    """Fetch and broadcast one headline immediately (periodic loop + /news command)."""
    if not _bot_queue:
        headlines = await _fetch_headlines()
        fresh = [h for h in headlines if h not in _bot_seen]
        _bot_queue.extend(fresh if fresh else headlines)
        if not _bot_queue:
            logger.warning("News bot: no headlines returned.")
            return

    headline = _bot_queue.pop(0)
    _bot_seen.add(headline)
    ciphertext = _encrypt(f"📰 {headline}", _bot_key)
    await manager.broadcast(_build_broadcast(ciphertext))
    logger.info(f"News bot broadcast: {headline[:60]}...")
