"""Tests for src.btc_bot."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src import btc_bot


@pytest.mark.parametrize(
    ("current", "previous", "marker"),
    [
        (100.0, None, "baseline set"),
        (110.0, 100.0, "IT'S PUMPING"),
        (90.0, 100.0, "SELL NOW"),
    ],
)
def test_format_message_variants_cover_baseline_up_and_down(
    current: float,
    previous: float | None,
    marker: str,
) -> None:
    """Formatting should encode baseline and directional market language."""
    message = btc_bot._format_message(current, previous)

    assert marker in message
    assert "BTC $" in message


def test_encrypt_output_is_base64_string() -> None:
    """Encrypt helper should emit non-empty base64 payload."""
    key = btc_bot._derive_key("banana")

    ciphertext = btc_bot._encrypt("hello", key)

    assert isinstance(ciphertext, str)
    assert len(ciphertext) > 20


@pytest.mark.asyncio
async def test_fetch_and_broadcast_one_sends_payload_and_updates_previous_price(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When a price exists, one encrypted broadcast should be emitted."""
    manager = SimpleNamespace(broadcast=AsyncMock())
    btc_bot._previous_price = None

    async def _fake_fetch() -> float:
        return 12345.67

    monkeypatch.setattr(btc_bot, "fetch_btc_price", _fake_fetch)
    monkeypatch.setattr(btc_bot, "_encrypt", lambda plaintext, key: f"enc::{plaintext[:8]}")
    monkeypatch.setattr(btc_bot, "_build_broadcast", lambda ciphertext: {"content": ciphertext})

    await btc_bot.fetch_and_broadcast_one(manager)

    manager.broadcast.assert_awaited_once()
    sent = manager.broadcast.await_args.args[0]
    assert sent["content"].startswith("enc::")
    assert btc_bot._previous_price == 12345.67


@pytest.mark.asyncio
async def test_fetch_and_broadcast_one_skips_broadcast_when_price_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No broadcast should happen when the fetch returns None."""
    manager = SimpleNamespace(broadcast=AsyncMock())
    btc_bot._previous_price = 100.0

    async def _fake_fetch_none() -> None:
        return None

    monkeypatch.setattr(btc_bot, "fetch_btc_price", _fake_fetch_none)

    await btc_bot.fetch_and_broadcast_one(manager)

    manager.broadcast.assert_not_awaited()
    assert btc_bot._previous_price == 100.0
