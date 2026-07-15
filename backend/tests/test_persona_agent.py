"""Tests for Copilot persona generation and response prompts."""

from unittest.mock import AsyncMock

import pytest

from src.persona_agent import (
    PersonaAgent,
    PersonaAgentError,
    _parse_persona_name,
)


def test_parse_persona_name_accepts_valid_unique_name() -> None:
    """A valid generated mention name should be preserved."""
    assert _parse_persona_name("`Oracle`", ["Sage"]) == "Oracle"


@pytest.mark.parametrize("content", ["a", "has spaces", "@Oracle", "a" * 25])
def test_parse_persona_name_rejects_invalid_names(content: str) -> None:
    """Generated names must remain safe for mention matching."""
    with pytest.raises(PersonaAgentError, match="invalid persona name"):
        _parse_persona_name(content, [])


def test_parse_persona_name_rejects_case_insensitive_duplicate() -> None:
    """Copilot must not reuse a name already active in the Key Space."""
    with pytest.raises(PersonaAgentError, match="already exists"):
        _parse_persona_name("Oracle", ["oracle"])


@pytest.mark.asyncio
async def test_generate_name_and_response_supply_scoped_prompts(tmp_path) -> None:
    """Persona operations should pass identity and context through the isolated completion."""
    agent = PersonaAgent(base_directory=tmp_path)
    completion = AsyncMock(side_effect=["Oracle", "The stars say yes."])
    agent._complete = completion

    name = await agent.generate_name("A mysterious oracle", ["Sage"])
    reply = await agent.respond(
        name,
        "A mysterious oracle",
        "@Oracle should we go?",
        [{"username": "alice", "content": "The path is dark."}],
    )

    assert name == "Oracle"
    assert reply == "The stars say yes."
    assert "unavailable name" in completion.await_args_list[0].args[0]
    assert "A mysterious oracle" in completion.await_args_list[1].args[0]
    assert "The path is dark" in completion.await_args_list[1].args[1]
