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
  typewriter?: boolean
}

export interface MediaMessage {
  id: string
  user_id: string
  username: string
  created_at?: string
  kind: 'media'
  media: (MediaPayload & { objectUrl: string }) | { failed: true }
}

interface SystemMessage {
  type: 'user_joined' | 'user_left'
  username: string
  user_id: string
}

interface LocalMessage {
  id: string
  type: 'system'
  text: string
}

export type ChatMessage = TextMessage | MediaMessage | SystemMessage | LocalMessage

interface MessageListProps {
  messages: ChatMessage[]
}

function isSystem(msg: ChatMessage): msg is SystemMessage {
  return 'type' in msg && (msg.type === 'user_joined' || msg.type === 'user_left')
}

function isLocal(msg: ChatMessage): msg is LocalMessage {
  return 'type' in msg && msg.type === 'system' && 'text' in msg
}

const NICK_COLORS = [
  '#00FF00', '#00FFFF', '#FFFF00', '#FF00FF',
  '#FF0000', '#0000FF', '#00D7D7', '#D700D7',
]

function nickColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) & 0xffffffff
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

const TYPEWRITER_PER_CHAR_MS = 100

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    indexRef.current = 0
    setDisplayed('')
    const timer = setInterval(() => {
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) clearInterval(timer)
    }, TYPEWRITER_PER_CHAR_MS)
    return () => clearInterval(timer)
  }, [text])

  return (
    <>
      {displayed}
      {displayed.length < text.length && (
        <span className="block-cursor">█</span>
      )}
    </>
  )
}

function MediaLine({ msg }: { msg: MediaMessage }) {
  const [lightbox, setLightbox] = useState(false)

  if ('failed' in msg.media) {
    return (
      <span className="message-line">
        <span className="message-nick" style={{ color: nickColor(msg.username) }}>
          &lt;{msg.username.toUpperCase()}&gt;
        </span>{' '}
        <span className="message-text">*** ENCRYPTED MEDIA — WRONG PASSPHRASE ***</span>
      </span>
    )
  }

  const { mime, objectUrl, name, caption } = msg.media

  return (
    <span className="message-line message-media">
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
        if (isLocal(msg)) {
          return (
            <span key={msg.id} className="system-line" style={{ whiteSpace: 'pre' }}>
              {msg.text}
            </span>
          )
        }

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
          <span key={msg.id} className="message-line">
            <span className="message-nick" style={{ color: nickColor(msg.username) }}>
              &lt;{msg.username.toUpperCase()}&gt;
            </span>{' '}
            <span className="message-text">
              {msg.typewriter
                ? <TypewriterText text={msg.content} />
                : msg.content}
            </span>
          </span>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}
