import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import './ChatBox.css'

interface User {
  id: string
  username: string
}

interface Message {
  id: string
  content: string
  user_id: string
  username: string
  created_at: string
}

interface SystemMessage {
  type: 'user_joined' | 'user_left'
  username: string
  user_id: string
}

interface ChatBoxProps {
  user: User
  onLogout: () => void
}

export default function ChatBox({ user, onLogout }: ChatBoxProps) {
  const [messages, setMessages] = useState<(Message | SystemMessage)[]>([])
  const { ws, isConnected } = useWebSocket(user.id, (msg) => {
    setMessages((prev) => [...prev, msg])
  })

  useEffect(() => {
    if (!isConnected) return

    // Fetch message history
    fetch(`/api/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
      .catch(console.error)
  }, [isConnected])

  const handleSendMessage = (content: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'message',
          content
        })
      )
    }
  }

  return (
    <div className="chat-box">
      <div className="chat-header">
        <div>
          <h2>Chat Room</h2>
          <p className="user-info">Logged in as: <strong>{user.username}</strong></p>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          Leave Chat
        </button>
      </div>
      <MessageList messages={messages} />
      <ChatInput onSendMessage={handleSendMessage} disabled={!isConnected} />
      {!isConnected && <div className="connection-status">Connecting...</div>}
    </div>
  )
}
