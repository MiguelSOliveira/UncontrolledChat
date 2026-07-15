# UncontrolledChat

A real-time chat application built with FastAPI (Python backend) and React (TypeScript frontend).

## Features

- **User Join**: Enter a username to join the chat
- **Real-time Messaging**: Send and receive messages instantly via WebSockets
- **User Notifications**: See when users join or leave
- **Message History**: View all messages sent in the chat

## Tech Stack

- **Backend**: FastAPI, Python 3.11+, WebSockets
- **Frontend**: React 18, TypeScript, Vite
- **Storage**: In-memory (MVP)

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### Quick Start

**Terminal 1 - Start Backend:**

```bash
cd backend
pip install -e .
python -m src.main
```

The backend will start on `http://localhost:8000`
- WebSocket: `ws://localhost:8000`
- API docs: `http://localhost:8000/docs`

**Optional - Start MCP persona server (for agents):**

```bash
cd backend
pip install -e .
uncontrolledchat-mcp-persona
```

The MCP server exposes tools to list personas and create encrypted personas in a Key Space from a passphrase.

**Terminal 2 - Start Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`

### How to Use the Chat

1. **Open the app**: Navigate to `http://localhost:3000` in your browser
2. **Join the chat**: Enter your username and click "Join Chat"
3. **Send messages**: Type a message and press Enter or click the send button
4. **See real-time updates**: 
   - Messages from other users appear instantly
   - Get notifications when users join/leave
5. **Leave**: Click "Leave Chat" to disconnect

### Connect Multiple Users

Open multiple browser windows/tabs at `http://localhost:3000`:
- Each can join with a different username
- Messages broadcast to all connected users in real-time
- System messages show when users join/leave

### Technical Details

**Backend API Endpoints:**

- `POST /api/users?username=<name>` - Create a new user
- `GET /api/users` - Get all active users
- `GET /api/messages` - Get message history
- `WebSocket /ws/{user_id}` - Real-time messaging connection

**Message Format:**

```json
{
  "type": "message",
  "content": "Hello!",
  "user_id": "abc123",
  "username": "John",
  "id": "msg123",
  "created_at": "2024-07-14T14:00:00"
}
```

**System Events:**

```json
{
  "type": "user_joined",
  "username": "John",
  "user_id": "abc123"
}
```

## Development

### Backend

- **Lint**: `cd backend && ruff check src tests`
- **Format**: `cd backend && ruff format src tests`
- **Type Check**: `cd backend && mypy src`
- **Test**: `cd backend && pytest`

### Frontend

- **Lint**: `cd frontend && npm run lint`
- **Build**: `cd frontend && npm run build`

## Project Structure

```
uncontrolled-chat/
├── backend/              # FastAPI application
│   ├── src/
│   │   ├── main.py      # Entry point and API routes
│   │   ├── models.py    # User and Message dataclasses
│   │   └── websocket.py # WebSocket connection manager
│   └── pyproject.toml
├── frontend/             # React TypeScript application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom React hooks
│   │   └── App.tsx      # Main App component
│   └── package.json
└── README.md
```

## How It Works

1. User enters a username and joins the chat
2. Frontend creates a WebSocket connection to the backend
3. Backend broadcasts join notifications to all connected clients
4. Users can send messages in real-time
5. Backend broadcasts messages to all connected clients
6. User leave events are also broadcasted

## Bonus Features (Future)

- Message persistence (database)
- User authentication
- Private messages
- Chat channels
- Rich media (images, videos, links)
- Emoji support
