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
            <div key={msg.id} className="message">
              <span className="username">{msg.username}</span>
              <span className="content">{msg.content}</span>
            </div>
          )
        } else {
          const action = msg.type === 'user_joined' ? 'joined' : 'left'
          return (
            <div key={`${msg.user_id}-${msg.type}`} className="system-message">
              <em>{msg.username} {action} the chat</em>
            </div>
          )
        }
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}
