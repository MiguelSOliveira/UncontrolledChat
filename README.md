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

### Backend Setup

```bash
cd backend
pip install -e .
python -m src.main
```

The backend will start on `http://localhost:8000`

API docs available at `http://localhost:8000/docs`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`

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
