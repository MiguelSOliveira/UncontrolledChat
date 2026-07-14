import { useEffect, useRef } from 'react'
import './MessageList.css'

interface Message {
  id: string
  content: string
  user_id: string
  username: string
  created_at?: string
}

interface SystemMessage {
  type: 'user_joined' | 'user_left'
  username: string
  user_id: string
}

interface MessageListProps {
  messages: (Message | SystemMessage)[]
}

// ZX Spectrum bright nick colors (excluding black/white for readability)
const NICK_COLORS = [
  '#00FF00', // bright green
  '#00FFFF', // bright cyan
  '#FFFF00', // bright yellow
  '#FF00FF', // bright magenta
  '#FF0000', // bright red
  '#0000FF', // bright blue
  '#00D7D7', // cyan
  '#D700D7', // magenta
]

function nickColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) & 0xffffffff
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

export default function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="message-list">
      {messages.map((msg) => {
        if ('content' in msg) {
          return (
            <span key={msg.id} className="message-line">
              <span className="message-nick" style={{ color: nickColor(msg.username) }}>
                &lt;{msg.username.toUpperCase()}&gt;
              </span>
              {' '}
              <span className="message-text">{msg.content}</span>
            </span>
          )
        } else {
          const action = msg.type === 'user_joined' ? 'HAS JOINED' : 'HAS LEFT'
          return (
            <span key={`${msg.user_id}-${msg.type}`} className="system-line">
              *** {msg.username.toUpperCase()} {action} THE CHANNEL
            </span>
          )
        }
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}
