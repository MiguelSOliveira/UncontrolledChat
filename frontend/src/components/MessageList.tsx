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
const IMAGE_REVEAL_SECTIONS = 5
const IMAGE_REVEAL_INTERPOLATION_PASSES = 5
const IMAGE_REVEAL_STEP_MS = 200

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

function SpectrumImageReveal({
  src,
  alt,
  onClick,
  onImageReady,
}: {
  src: string
  alt: string
  onClick: () => void
  onImageReady: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [imageReady, setImageReady] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setStepIndex(0)
    setImageReady(false)
  }, [src])

  useEffect(() => {
    if (!imageReady) return
    const totalSteps = IMAGE_REVEAL_SECTIONS * IMAGE_REVEAL_INTERPOLATION_PASSES
    const timer = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= totalSteps) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, IMAGE_REVEAL_STEP_MS)
    return () => clearInterval(timer)
  }, [imageReady, src])

  useEffect(() => {
    if (!imageReady) return
    const imageEl = imageRef.current
    const canvasEl = canvasRef.current
    if (!imageEl || !canvasEl) return

    const width = imageEl.clientWidth
    const height = imageEl.clientHeight
    if (!width || !height) return

    const devicePixelRatio = window.devicePixelRatio || 1
    canvasEl.width = Math.max(1, Math.floor(width * devicePixelRatio))
    canvasEl.height = Math.max(1, Math.floor(height * devicePixelRatio))
    canvasEl.style.width = `${width}px`
    canvasEl.style.height = `${height}px`

    const context = canvasEl.getContext('2d')
    if (!context) return
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#000000'
    context.fillRect(0, 0, width, height)

    const completedSections = Math.floor(stepIndex / IMAGE_REVEAL_INTERPOLATION_PASSES)
    const currentPass = stepIndex % IMAGE_REVEAL_INTERPOLATION_PASSES
    const sectionHeight = Math.ceil(height / IMAGE_REVEAL_SECTIONS)

    // Reveal fully completed sections.
    for (let sectionIndex = 0; sectionIndex < completedSections; sectionIndex += 1) {
      const startY = sectionIndex * sectionHeight
      const endY = Math.min(height, startY + sectionHeight)
      context.clearRect(0, startY, width, endY - startY)
    }

    // In the current section, reveal interpolated lines pass-by-pass.
    if (completedSections < IMAGE_REVEAL_SECTIONS) {
      const sectionStartY = completedSections * sectionHeight
      const sectionEndY = Math.min(height, sectionStartY + sectionHeight)
      for (let line = sectionStartY; line < sectionEndY; line += 1) {
        const lineIndex = line - sectionStartY
        const startOffset = (lineIndex * 3) % IMAGE_REVEAL_INTERPOLATION_PASSES
        const stepsAvailable = IMAGE_REVEAL_INTERPOLATION_PASSES - startOffset
        const rawProgress = currentPass - startOffset + 1
        if (rawProgress <= 0) continue
        const clampedProgress = Math.min(stepsAvailable, rawProgress)
        const revealFraction = clampedProgress / Math.max(1, stepsAvailable)
        const revealWidth = Math.max(1, Math.floor(width * revealFraction))
        context.clearRect(0, line, revealWidth, 1)
      }
    }
  }, [imageReady, stepIndex])

  return (
    <span className="media-thumb-reveal-wrap" onClick={onClick}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="media-thumb media-thumb-reveal"
        onLoad={() => {
          setImageReady(true)
          onImageReady()
        }}
      />
      {imageReady && <canvas ref={canvasRef} className="media-thumb-reveal-canvas" />}
    </span>
  )
}

function MediaLine({ msg, onMediaReady }: { msg: MediaMessage; onMediaReady: () => void }) {
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
          <SpectrumImageReveal
            src={objectUrl}
            alt={name}
            onClick={() => setLightbox(true)}
            onImageReady={onMediaReady}
          />
        ) : (
          <video
            src={objectUrl}
            controls
            className="media-thumb"
            onLoadedMetadata={onMediaReady}
          />
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
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  useEffect(() => {
    scrollToBottom()
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
          return <MediaLine key={msg.id} msg={msg} onMediaReady={scrollToBottom} />
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
