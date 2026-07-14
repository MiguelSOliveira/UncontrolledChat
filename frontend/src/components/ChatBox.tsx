import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { RoomKey } from '../crypto/roomKey'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import './ChatBox.css'

interface Participant {
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
  participant: Participant
  roomKey: RoomKey
  onLogout: () => void
  onMessageReceived?: () => void
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

export default function ChatBox({ participant, roomKey, onLogout, onMessageReceived }: ChatBoxProps) {
  const [messages, setMessages] = useState<(Message | SystemMessage)[]>([])
  const { ws, isConnected } = useWebSocket(participant.id, async (msg) => {
    onMessageReceived?.()
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
          <h2>#UNCONTROLLEDCHAT 🔒</h2>
          <p className="user-info">
            NICK: <strong>{participant.username.toUpperCase()}</strong>
          </p>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          /QUIT
        </button>
      </div>
      <MessageList messages={messages} />
      <ChatInput onSendMessage={handleSendMessage} disabled={!isConnected} />
      {!isConnected && <div className="connection-status">Connecting...</div>}
    </div>
  )
}
