import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { RoomKey } from '../crypto/roomKey'
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
  roomKey: RoomKey
  onLogout: () => void
}

const DECRYPT_FAILED = '🔒 (unreadable — different passphrase)'

async function decryptMessage(msg: Message, roomKey: RoomKey): Promise<Message> {
  try {
    const plaintext = await roomKey.decrypt(msg.content)
    return { ...msg, content: plaintext }
  } catch {
    return { ...msg, content: DECRYPT_FAILED }
  }
}

export default function ChatBox({ user, roomKey, onLogout }: ChatBoxProps) {
  const [messages, setMessages] = useState<(Message | SystemMessage)[]>([])
  const { ws, isConnected } = useWebSocket(user.id, async (msg) => {
    if (msg.type === 'message') {
      const decrypted = await decryptMessage(msg, roomKey)
      setMessages((prev) => [...prev, decrypted])
    } else {
      setMessages((prev) => [...prev, msg])
    }
  })

  useEffect(() => {
    if (!isConnected) return

    fetch(`/api/messages`)
      .then((res) => res.json())
      .then(async (data: Message[]) => {
        const decrypted = await Promise.all(
          data.map((m) => decryptMessage(m, roomKey))
        )
        setMessages(decrypted)
      })
      .catch(console.error)
  }, [isConnected, roomKey])

  const handleSendMessage = async (content: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const ciphertext = await roomKey.encrypt(content)
    ws.send(
      JSON.stringify({
        type: 'message',
        content: ciphertext
      })
    )
  }

  return (
    <div className="chat-box">
      <div className="chat-header">
        <div>
          <h2>Chat Room 🔒</h2>
          <p className="user-info">
            Logged in as: <strong>{user.username}</strong>
          </p>
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
