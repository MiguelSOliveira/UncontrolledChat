import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { RoomKey } from '../crypto/roomKey'
import MessageList, { ChatMessage, MediaMessage } from './MessageList'
import ChatInput from './ChatInput'
import {
  MAX_MEDIA_BYTES,
  decryptMedia,
  encryptFile,
  formatBytes,
  isAcceptedFile
} from '../media/media'
import './ChatBox.css'

interface Participant {
  id: string
  username: string
}

interface TextMessageWire {
  id: string
  content: string
  user_id: string
  username: string
  created_at: string
  typewriter?: boolean
}

interface MediaMessageWire {
  type: 'media'
  id: string
  user_id: string
  username: string
  ciphertext: string
  created_at: string
}

interface ChatBoxProps {
  participant: Participant
  roomKey: RoomKey
  onLogout: () => void
  onMessageReceived?: () => void
}

const DECRYPT_FAILED = '🔒 (unreadable — different passphrase)'

async function decryptTextMessage(
  msg: TextMessageWire,
  roomKey: RoomKey
): Promise<ChatMessage> {
  try {
    const plaintext = await roomKey.decrypt(msg.content)
    return { ...msg, content: plaintext, kind: 'text' }
  } catch {
    return { ...msg, content: DECRYPT_FAILED, kind: 'text' }
  }
}

async function decryptMediaMessage(
  msg: MediaMessageWire,
  roomKey: RoomKey
): Promise<MediaMessage> {
  try {
    const media = await decryptMedia(msg.ciphertext, roomKey)
    return {
      id: msg.id,
      user_id: msg.user_id,
      username: msg.username,
      created_at: msg.created_at,
      kind: 'media',
      media
    }
  } catch {
    return {
      id: msg.id,
      user_id: msg.user_id,
      username: msg.username,
      created_at: msg.created_at,
      kind: 'media',
      media: { failed: true }
    }
  }
}

function randomId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export default function ChatBox({ participant, roomKey, onLogout, onMessageReceived }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const { ws, isConnected } = useWebSocket(participant.id, async (msg) => {
    onMessageReceived?.()
    if (msg.type === 'message') {
      const decrypted = await decryptTextMessage(msg, roomKey)
      setMessages((prev) => [...prev, { ...decrypted, typewriter: true }])
    } else if (msg.type === 'media') {
      const decrypted = await decryptMediaMessage(msg, roomKey)
      setMessages((prev) => [...prev, decrypted])
    } else {
      setMessages((prev) => [...prev, msg])
    }
  })

  useEffect(() => {
    if (!isConnected) return

    fetch(`/api/messages`)
      .then((res) => res.json())
      .then(async (data: TextMessageWire[]) => {
        const decrypted = await Promise.all(
          data.map((m) => decryptTextMessage(m, roomKey))
        )
        setMessages(decrypted)
      })
      .catch(console.error)
  }, [isConnected, roomKey])

  const COMMANDS = [
    { cmd: '/news', desc: 'Fetch the latest BBC headline now' },
    { cmd: '/?',   desc: 'Show this help' },
  ]

  const injectLocal = (text: string) =>
    setMessages((prev) => [
      ...prev,
      { id: randomId(), type: 'system' as const, text },
    ])

  const handleSendMessage = async (content: string) => {
    const cmd = content.trim()

    if (cmd === '/?') {
      const lines = ['Available commands:', ...COMMANDS.map((c) => `  ${c.cmd.padEnd(10)} — ${c.desc}`)]
      injectLocal(lines.join('\n'))
      return
    }

    if (cmd === '/news') {
      await fetch('/api/news', { method: 'POST' }).catch(console.error)
      return
    }

    if (cmd.startsWith('/')) {
      injectLocal(`Unknown command: ${cmd}  (type /? for help)`)
      return
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const ciphertext = await roomKey.encrypt(content)
    ws.send(JSON.stringify({ type: 'message', content: ciphertext }))
  }

  const handleSendMedia = async (file: File, caption: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    const ciphertext = await encryptFile(file, caption, roomKey)
    ws.send(
      JSON.stringify({
        type: 'media',
        id: randomId(),
        ciphertext,
        created_at: new Date().toISOString()
      })
    )
  }

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    setDropError(null)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!isAcceptedFile(file)) {
      setDropError('Only image and video files are supported')
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setDropError(`File is too large (max ${formatBytes(MAX_MEDIA_BYTES)})`)
      return
    }
    setPendingFile(file)
  }

  return (
    <div
      className="chat-box"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
      <ChatInput
        onSendMessage={handleSendMessage}
        onSendMedia={handleSendMedia}
        disabled={!isConnected}
        pendingFile={pendingFile}
        onPendingFileChange={(f) => {
          setPendingFile(f)
          setDropError(null)
        }}
      />
      {dropError && <div className="drop-error">{dropError}</div>}
      {!isConnected && <div className="connection-status">Connecting...</div>}
      {dragActive && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <div className="drop-overlay-icon">📎</div>
            <div>Drop to send image or video</div>
            <div className="drop-overlay-hint">
              Max {formatBytes(MAX_MEDIA_BYTES)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
