"""WebSocket connection manager for real-time chat."""

import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self.active_connections: list = []

    async def connect(self, websocket: object) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()  # type: ignore
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: object) -> None:
        """Remove a disconnected WebSocket."""
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict) -> None:
        """Broadcast a message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)  # type: ignore
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)

    async def send_personal_message(self, message: dict, websocket: object) -> None:
        """Send a message to a specific client."""
        try:
            await websocket.send_json(message)  # type: ignore
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
