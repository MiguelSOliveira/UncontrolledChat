"""FastAPI backend for UncontrolledChat."""

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from .btc_bot import fetch_and_broadcast_one as btc_fetch_one
from .database import (
    clear_messages,
    delete_persona,
    get_all_messages,
    get_participant,
    get_persona,
    get_personas,
    get_session,
    init_db,
    save_message,
    save_participant,
    save_persona,
)
from .models import Message, Participant
from .news_bot import fetch_and_broadcast_one as news_fetch_one
from .persona_agent import PersonaAgent, PersonaAgentError
from .websocket import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory WebSocket connection manager (connections can't be persisted)
manager = ConnectionManager()
persona_agent = PersonaAgent()

KEY_SPACE_ID_PATTERN = r"^[a-f0-9]{64}$"
NAME_TOKEN_PATTERN = r"^[a-f0-9]{64}$"
PERSONA_WIRE_USERNAME = "Persona"
PERSONA_USER_ID_PREFIX = "persona:"


class PersonaStoreRequest(BaseModel):
    """Encrypted persona definition supplied by a Key Space participant."""

    key_space_id: str = Field(pattern=KEY_SPACE_ID_PATTERN)
    name_token: str = Field(pattern=NAME_TOKEN_PATTERN)
    ciphertext: str = Field(min_length=1, max_length=100_000)


class PersonaGenerateRequest(BaseModel):
    """Description and unavailable names used to create a persona name."""

    description: str = Field(min_length=1, max_length=2_000)
    existing_names: list[str] = Field(default_factory=list)


class PersonaContextMessage(BaseModel):
    """One readable chat message explicitly shared with Copilot."""

    username: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=4_000)


class PersonaReplyRequest(BaseModel):
    """Persona identity and recent chat context for one response."""

    key_space_id: str = Field(pattern=KEY_SPACE_ID_PATTERN)
    name: str = Field(min_length=2, max_length=24)
    description: str = Field(min_length=1, max_length=2_000)
    mention: str = Field(min_length=1, max_length=4_000)
    context: list[PersonaContextMessage] = Field(default_factory=list, max_length=20)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage app lifecycle."""
    logger.info("UncontrolledChat backend starting...")
    await init_db()
    logger.info("Database initialised.")
    try:
        yield
    finally:
        await persona_agent.stop()
        logger.info("UncontrolledChat backend shutting down...")


app = FastAPI(title="UncontrolledChat API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/participants")
async def create_participant(username: str) -> dict[str, str]:
    """Create a new participant with the given username."""
    if not username or not username.strip():
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    participant = Participant(username=username.strip())
    async with await get_session() as session:
        await save_participant(session, participant.id, participant.username, participant.joined_at)
    logger.info(f"Participant created: {participant.username} ({participant.id})")

    return {
        "id": participant.id,
        "username": participant.username,
        "joined_at": participant.joined_at.isoformat(),
    }


@app.get("/api/messages")
async def get_messages() -> list[dict[str, str]]:
    """Get all messages."""
    async with await get_session() as session:
        rows = await get_all_messages(session)
    return [row.to_dict() for row in rows]


@app.get("/api/participants")
async def get_participants() -> list[dict[str, str]]:
    """Get all active participants (currently connected via WebSocket)."""
    return []


@app.delete("/api/messages")
async def delete_messages() -> dict[str, bool]:
    """Clear all persisted messages and notify all clients to wipe their view."""
    async with await get_session() as session:
        await clear_messages(session)
    await manager.broadcast({"type": "clear"})
    return {"ok": True}


@app.post("/api/news")
async def trigger_news() -> dict[str, bool]:
    """Immediately broadcast the next BBC headline to all connected clients."""
    await news_fetch_one(manager)
    return {"ok": True}


@app.post("/api/crypto")
async def trigger_crypto() -> dict[str, bool]:
    """Immediately broadcast a BTC price update to all connected clients."""
    await btc_fetch_one(manager)
    return {"ok": True}


@app.get("/api/personas")
async def list_personas(
    key_space_id: str = Query(pattern=KEY_SPACE_ID_PATTERN),
) -> list[dict[str, str]]:
    """Return encrypted persona definitions for one Key Space."""
    async with await get_session() as session:
        rows = await get_personas(session, key_space_id)

    return [row.to_dict() for row in rows]


@app.post("/api/personas/generate")
async def generate_persona(
    request: PersonaGenerateRequest,
) -> dict[str, str]:
    """Generate a unique persona name with Copilot."""
    try:
        name = await persona_agent.generate_name(
            request.description.strip(),
            request.existing_names,
        )
    except PersonaAgentError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {"name": name}


@app.post("/api/personas")
async def create_persona(request: PersonaStoreRequest) -> dict[str, str]:
    """Persist an encrypted persona and announce it to connected clients."""
    created_at = datetime.now(timezone.utc)
    persona_id = uuid.uuid4().hex
    try:
        async with await get_session() as session:
            row = await save_persona(
                session,
                persona_id,
                request.key_space_id,
                request.name_token,
                request.ciphertext,
                created_at,
            )
    except IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail="A persona with that name already exists in this Key Space.",
        ) from error

    payload = row.to_dict()
    await manager.broadcast({"type": "persona_created", **payload})

    return payload


@app.delete("/api/personas/{persona_id}")
async def destroy_persona(
    persona_id: str,
    key_space_id: str = Query(pattern=KEY_SPACE_ID_PATTERN),
) -> dict[str, bool]:
    """Destroy a persona when it belongs to the supplied Key Space."""
    async with await get_session() as session:
        removed = await delete_persona(session, persona_id, key_space_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Persona not found.")

    await manager.broadcast(
        {
            "type": "persona_destroyed",
            "id": persona_id,
        }
    )

    return {"ok": True}


@app.post("/api/personas/{persona_id}/respond")
async def respond_as_persona(
    persona_id: str,
    request: PersonaReplyRequest,
) -> dict[str, str]:
    """Ask Copilot to answer one mention as an existing persona."""
    async with await get_session() as session:
        persona = await get_persona(session, persona_id, request.key_space_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona not found.")

    try:
        content = await persona_agent.respond(
            request.name,
            request.description.strip(),
            request.mention.strip(),
            [message.model_dump() for message in request.context],
        )
    except PersonaAgentError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {"content": content}


@app.websocket("/ws/{participant_id}")
async def websocket_endpoint(
    websocket: WebSocket,  # type: ignore[type-arg]
    participant_id: str,
) -> None:
    """WebSocket endpoint for real-time messaging."""
    async with await get_session() as session:
        participant = await get_participant(session, participant_id)

    if participant is None:
        await websocket.close(code=1008, reason="Participant not found")
        return

    await manager.connect(websocket)

    join_message = {
        "type": "user_joined",
        "username": participant.username,
        "user_id": participant.id,
    }
    await manager.broadcast(join_message)

    try:
        while True:
            data = await websocket.receive_json()

            msg_type = data.get("type")

            if msg_type == "message":
                content = data.get("content", "").strip()
                if content:
                    msg = Message(
                        content=content,
                        user_id=participant.id,
                        username=participant.username,
                    )
                    async with await get_session() as session:
                        await save_message(
                            session,
                            msg.id,
                            msg.content,
                            msg.user_id,
                            msg.username,
                            msg.created_at,
                        )
                    logger.info(
                        f"Encrypted message from {participant.username} ({len(content)} chars)"
                    )

                    await manager.broadcast(
                        {
                            "type": "message",
                            **msg.to_dict(),
                        }
                    )
            elif msg_type == "media":
                # Media messages are relayed but never persisted. The server only
                # sees ciphertext (mime/name/caption are encrypted client-side).
                ciphertext = data.get("ciphertext")
                if not ciphertext:
                    continue
                logger.info(
                    f"Encrypted media from {participant.username} "
                    f"(~{len(ciphertext)} b64 chars)"
                )
                await manager.broadcast(
                    {
                        "type": "media",
                        "id": data.get("id"),
                        "user_id": participant.id,
                        "username": participant.username,
                        "ciphertext": ciphertext,
                        "created_at": data.get("created_at"),
                    }
                )
            elif msg_type == "persona_message":
                content = data.get("content", "").strip()
                persona_id = data.get("persona_id", "").strip()
                key_space_id = data.get("key_space_id", "").strip()
                if not content or not persona_id or not key_space_id:
                    continue

                async with await get_session() as session:
                    persona = await get_persona(session, persona_id, key_space_id)
                    if persona is None:
                        continue
                    msg = Message(
                        content=content,
                        user_id=f"{PERSONA_USER_ID_PREFIX}{persona_id}",
                        username=PERSONA_WIRE_USERNAME,
                    )
                    await save_message(
                        session,
                        msg.id,
                        msg.content,
                        msg.user_id,
                        msg.username,
                        msg.created_at,
                    )

                logger.info(f"Encrypted response from persona {persona_id}")
                await manager.broadcast({"type": "message", **msg.to_dict()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        leave_message = {
            "type": "user_left",
            "username": participant.username,
            "user_id": participant.id,
        }
        await manager.broadcast(leave_message)
        logger.info(f"Participant disconnected: {participant.username}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, ws_max_size=20 * 1024 * 1024)
