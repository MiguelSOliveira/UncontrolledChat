"""Tests for src.news_bot."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src import news_bot


def test_encrypt_output_is_base64_string() -> None:
    """Encrypt helper should emit non-empty base64 payload."""
    key = news_bot._derive_key("banana")

    ciphertext = news_bot._encrypt("headline", key)

    assert isinstance(ciphertext, str)
    assert len(ciphertext) > 20


@pytest.mark.asyncio
async def test_fetch_and_broadcast_one_uses_queue_then_refreshes_from_feed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bot should dequeue headlines and refill from feed when queue is empty."""
    manager = SimpleNamespace(broadcast=AsyncMock())
    news_bot._bot_seen = set()
    news_bot._bot_queue = []

    async def _fake_headlines() -> list[str]:
        return ["Headline A", "Headline B"]

    monkeypatch.setattr(news_bot, "_fetch_headlines", _fake_headlines)
    monkeypatch.setattr(news_bot, "_encrypt", lambda plaintext, key: f"enc::{plaintext}")
    monkeypatch.setattr(news_bot, "_build_broadcast", lambda ciphertext: {"content": ciphertext})

    await news_bot.fetch_and_broadcast_one(manager)
    await news_bot.fetch_and_broadcast_one(manager)

    assert manager.broadcast.await_count == 2
    first = manager.broadcast.await_args_list[0].args[0]["content"]
    second = manager.broadcast.await_args_list[1].args[0]["content"]
    assert "Headline A" in first
    assert "Headline B" in second
    assert news_bot._bot_seen == {"Headline A", "Headline B"}


@pytest.mark.asyncio
async def test_fetch_and_broadcast_one_skips_when_feed_returns_no_headlines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bot should not broadcast when both queue and feed are empty."""
    manager = SimpleNamespace(broadcast=AsyncMock())
    news_bot._bot_seen = set()
    news_bot._bot_queue = []

    async def _fake_empty() -> list[str]:
        return []

    monkeypatch.setattr(news_bot, "_fetch_headlines", _fake_empty)

    await news_bot.fetch_and_broadcast_one(manager)

    manager.broadcast.assert_not_awaited()
