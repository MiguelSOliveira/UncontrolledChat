"""FastAPI backend for UncontrolledChat."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import Message, User
from websocket import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage
users: dict[str, User] = {}
messages: list[Message] = []
manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle."""
    logger.info("UncontrolledChat backend starting...")
    yield
    logger.info("UncontrolledChat backend shutting down...")


app = FastAPI(title="UncontrolledChat API", lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/users")
async def create_user(username: str) -> dict:
    """Create a new user with the given username."""
    if not username or not username.strip():
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    user = User(username=username.strip())
    users[user.id] = user
    logger.info(f"User created: {user.username} ({user.id})")

    return {
        "id": user.id,
        "username": user.username,
        "joined_at": user.joined_at.isoformat(),
    }


@app.get("/api/messages")
async def get_messages() -> list[dict]:
    """Get all messages."""
    return [msg.to_dict() for msg in messages]


@app.get("/api/users")
async def get_users() -> list[dict]:
    """Get all active users."""
    return [
        {
            "id": user.id,
            "username": user.username,
            "joined_at": user.joined_at.isoformat(),
        }
        for user in users.values()
    ]


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str) -> None:
    """WebSocket endpoint for real-time messaging."""
    if user_id not in users:
        await websocket.close(code=1008, reason="User not found")
        return

    user = users[user_id]
    await manager.connect(websocket)

    # Notify all users that someone joined
    join_message = {
        "type": "user_joined",
        "username": user.username,
        "user_id": user.id,
    }
    await manager.broadcast(join_message)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "message":
                content = data.get("content", "").strip()
                if content:
                    message = Message(
                        content=content,
                        user_id=user.id,
                        username=user.username,
                    )
                    messages.append(message)
                    logger.info(f"Message from {user.username}: {content}")

                    await manager.broadcast(
                        {
                            "type": "message",
                            **message.to_dict(),
                        }
                    )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        leave_message = {
            "type": "user_left",
            "username": user.username,
            "user_id": user.id,
        }
        await manager.broadcast(leave_message)
        logger.info(f"User disconnected: {user.username}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
