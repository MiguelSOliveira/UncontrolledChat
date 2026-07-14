import { useEffect, useRef, useState } from 'react'
import './MessageList.css'
import { MediaPayload } from '../media/media'

interface TextMessage {
  id: string
  content: string
  user_id: string
  username: string
  created_at?: string
  kind?: 'text'
  fresh?: boolean
}

export interface MediaMessage {
  id: string
  user_id: string
  username: string
  created_at?: string
  kind: 'media'
  media: (MediaPayload & { objectUrl: string }) | { failed: true }
  fresh?: boolean
}

interface SystemMessage {
  type: 'user_joined' | 'user_left'
  username: string
  user_id: string
}

export type ChatMessage = TextMessage | MediaMessage | SystemMessage

interface MessageListProps {
  messages: ChatMessage[]
}

function isSystem(msg: ChatMessage): msg is SystemMessage {
  return 'type' in msg && (msg.type === 'user_joined' || msg.type === 'user_left')
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
  '#D700D7'  // magenta
]

function nickColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) & 0xffffffff
  }

  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

function MediaLine({ msg }: { msg: MediaMessage }) {
  const [lightbox, setLightbox] = useState(false)
  const className = `message-line message-media${msg.fresh ? ' message--fresh' : ''}`

  if ('failed' in msg.media) {
    return (
      <span className={className}>
        <span className="message-nick" style={{ color: nickColor(msg.username) }}>
          &lt;{msg.username.toUpperCase()}&gt;
        </span>{' '}
        <span className="message-text">*** ENCRYPTED MEDIA — WRONG PASSPHRASE ***</span>
      </span>
    )
  }

  const { mime, objectUrl, name, caption } = msg.media

  return (
    <span className={className}>
      <span className="message-nick" style={{ color: nickColor(msg.username) }}>
        &lt;{msg.username.toUpperCase()}&gt;
      </span>{' '}
      <span className="message-media-body">
        {mime.startsWith('image/') ? (
          <img
            src={objectUrl}
            alt={name}
            className="media-thumb"
            onClick={() => setLightbox(true)}
          />
        ) : (
          <video src={objectUrl} controls className="media-thumb" />
        )}
        <span className="media-caption">
          {caption ? <span className="media-caption-text">{caption}</span> : null}
          <a href={objectUrl} download={name} className="media-filename">
            {name}
          </a>
        </span>
      </span>
      {lightbox && mime.startsWith('image/') && (
        <div className="media-lightbox" onClick={() => setLightbox(false)}>
          <img src={objectUrl} alt={name} />
        </div>
      )}
    </span>
  )
}

export default function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="message-list">
      {messages.map((msg) => {
        if (isSystem(msg)) {
          const action = msg.type === 'user_joined' ? 'HAS JOINED' : 'HAS LEFT'
          return (
            <span key={`${msg.user_id}-${msg.type}`} className="system-line">
              *** {msg.username.toUpperCase()} {action} THE CHANNEL
            </span>
          )
        }

        if (msg.kind === 'media') {
          return <MediaLine key={msg.id} msg={msg} />
        }

        return (
          <span
            key={msg.id}
            className={`message-line${msg.fresh ? ' message--fresh' : ''}`}
          >
            <span className="message-nick" style={{ color: nickColor(msg.username) }}>
              &lt;{msg.username.toUpperCase()}&gt;
            </span>{' '}
            <span className="message-text">{msg.content}</span>
          </span>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}
