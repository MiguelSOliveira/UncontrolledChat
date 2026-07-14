"""FastAPI backend for UncontrolledChat."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .btc_bot import fetch_and_broadcast_one as btc_fetch_one, run_btc_bot
from .news_bot import fetch_and_broadcast_one as news_fetch_one, run_news_bot
from .database import (
    clear_messages,
    get_all_messages,
    get_participant,
    get_session,
    init_db,
    save_message,
    save_participant,
)
from .models import Message, Participant
from .websocket import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory WebSocket connection manager (connections can't be persisted)
manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle."""
    logger.info("UncontrolledChat backend starting...")
    await init_db()
    logger.info("Database initialised.")
    bot_task = asyncio.create_task(run_btc_bot(manager))
    news_task = asyncio.create_task(run_news_bot(manager))
    try:
        yield
    finally:
        logger.info("UncontrolledChat backend shutting down...")
        bot_task.cancel()
        news_task.cancel()
        for task in (bot_task, news_task):
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="UncontrolledChat API", lifespan=lifespan)

# Enable CORS for local development (allow any origin so other devices on LAN can connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/participants")
async def create_participant(username: str) -> dict:
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
async def get_messages() -> list[dict]:
    """Get all messages."""
    async with await get_session() as session:
        rows = await get_all_messages(session)
    return [row.to_dict() for row in rows]


@app.get("/api/participants")
async def get_participants() -> list[dict]:
    """Get all active participants (currently connected via WebSocket)."""
    return []


@app.delete("/api/messages")
async def delete_messages() -> dict:
    """Clear all persisted messages and notify all clients to wipe their view."""
    async with await get_session() as session:
        await clear_messages(session)
    await manager.broadcast({"type": "clear"})
    return {"ok": True}


@app.post("/api/news")
async def trigger_news() -> dict:
    """Immediately broadcast the next BBC headline to all connected clients."""
    await news_fetch_one(manager)
    return {"ok": True}


@app.post("/api/crypto")
async def trigger_crypto() -> dict:
    """Immediately broadcast a BTC price update to all connected clients."""
    await btc_fetch_one(manager)
    return {"ok": True}


@app.websocket("/ws/{participant_id}")
async def websocket_endpoint(websocket: WebSocket, participant_id: str) -> None:
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
