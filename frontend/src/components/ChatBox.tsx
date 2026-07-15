import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { RoomKey } from '../crypto/roomKey'
import MessageList, { ChatMessage, MediaMessage } from './MessageList'
import ChatInput, { ChatInputHandle } from './ChatInput'
import {
  MAX_MEDIA_BYTES,
  decryptMedia,
  encryptFile,
  formatBytes,
  isAcceptedFile
} from '../media/media'
import {
  Persona,
  PersonaContextMessage,
  decryptPersona,
  destroyPersona,
  findMentionedPersonas,
  invokePersona,
  loadPersonas,
  requestPersonaReply
} from '../personas/personas'
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
  onMessageReceived?: (charCount: number) => void
}

type PersonaRegistryEvent =
  | { type: 'created'; persona: Persona }
  | { type: 'destroyed'; personaId: string; announced: boolean }

const DECRYPT_FAILED = '🔒 (unreadable — different passphrase)'
const PERSONA_USER_ID_PREFIX = 'persona:'
const CHARS_FOR_5_SECONDS = 500
const PERSONA_SINGLE_CLICK_DELAY_MS = 220

function parsePersonaMessage(plaintext: string): { name: string; content: string } {
  const value: unknown = JSON.parse(plaintext)
  if (
    typeof value !== 'object' ||
    value === null ||
    !('kind' in value) ||
    value.kind !== 'persona' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('content' in value) ||
    typeof value.content !== 'string'
  ) {
    throw new Error('Invalid encrypted Persona response')
  }
  return { name: value.name, content: value.content }
}

async function decryptTextMessage(
  msg: TextMessageWire,
  roomKey: RoomKey
): Promise<TextMessageWire & { kind: 'text' }> {
  try {
    const plaintext = await roomKey.decrypt(msg.content)
    if (msg.user_id.startsWith(PERSONA_USER_ID_PREFIX)) {
      const personaMessage = parsePersonaMessage(plaintext)

      return {
        ...msg,
        username: personaMessage.name,
        content: personaMessage.content,
        kind: 'text'
      }
    }

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

function buildPersonaContext(
  messages: ChatMessage[],
  currentMessage: PersonaContextMessage
): PersonaContextMessage[] {
  const readableMessages = messages.flatMap((message) => {
    if ('content' in message && message.content !== DECRYPT_FAILED) {
      return [{ username: message.username, content: message.content }]
    }

    return []
  })

  return [...readableMessages, currentMessage].slice(-20)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected persona error'
}

export default function ChatBox({ participant, roomKey, onLogout, onMessageReceived }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [destroyingPersonaIds, setDestroyingPersonaIds] = useState<Set<string>>(new Set())
  const personasRef = useRef<Persona[]>([])
  const chatInputRef = useRef<ChatInputHandle>(null)
  const personaClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const personaLoadingRef = useRef(true)
  const personaEventsRef = useRef<PersonaRegistryEvent[]>([])
  const destroyedPersonaIdsRef = useRef(new Set<string>())
  const handledMentionMessageIdsRef = useRef(new Set<string>())

  const injectLocal = (text: string) =>
    setMessages((prev) => [
      ...prev,
      { id: randomId(), type: 'system' as const, text },
    ])

  const replacePersonas = (nextPersonas: Persona[]) => {
    personasRef.current = nextPersonas
    setPersonas(nextPersonas)
  }

  const addPersona = (persona: Persona) => {
    replacePersonas([
      ...personasRef.current.filter((current) => current.id !== persona.id),
      persona
    ])
  }

  const removePersona = (personaId: string) => {
    replacePersonas(personasRef.current.filter((persona) => persona.id !== personaId))
  }

  const { ws, isConnected } = useWebSocket(participant.id, async (msg) => {
    if (msg.type === 'clear') {
      setMessages([])
      return
    }
    if (msg.type === 'message') {
      const decrypted = await decryptTextMessage(msg, roomKey)
      onMessageReceived?.(decrypted.content.length)
      setMessages((prev) => [...prev, { ...decrypted, typewriter: true }])
      if (decrypted.user_id === participant.id) return
      await respondToMentions(
        decrypted.id,
        decrypted.content,
        decrypted.username,
        decrypted.user_id
      )
    } else if (msg.type === 'media') {
      const decrypted = await decryptMediaMessage(msg, roomKey)
      if (!('failed' in decrypted.media) && decrypted.media.mime.startsWith('image/')) {
        onMessageReceived?.(CHARS_FOR_5_SECONDS)
      }
      setMessages((prev) => [...prev, decrypted])
    } else if (msg.type === 'persona_created') {
      if (destroyedPersonaIdsRef.current.has(msg.id)) return

      try {
        const persona = await decryptPersona(msg, roomKey)
        if (destroyedPersonaIdsRef.current.has(persona.id)) return

        if (personaLoadingRef.current) {
          personaEventsRef.current.push({ type: 'created', persona })
        }
        addPersona(persona)
        injectLocal(
          `*** @${persona.name.toUpperCase()} HAS ENTERED THE CHANNEL — ${persona.description}`
        )
      } catch {
        return
      }
    } else if (msg.type === 'persona_destroyed') {
      destroyedPersonaIdsRef.current.add(msg.id)
      const persona = personasRef.current.find((current) => current.id === msg.id)
      if (personaLoadingRef.current) {
        personaEventsRef.current.push({
          type: 'destroyed',
          personaId: msg.id,
          announced: Boolean(persona)
        })
      }
      if (persona) {
        removePersona(persona.id)
        injectLocal(`*** @${persona.name.toUpperCase()} HAS BEEN DESTROYED`)
      }
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

  useEffect(() => {
    return () => {
      if (personaClickTimerRef.current) {
        clearTimeout(personaClickTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isConnected) return

    personaLoadingRef.current = true
    personaEventsRef.current = []
    loadPersonas(roomKey)
      .then((loadedPersonas) => {
        let reconciledPersonas = loadedPersonas.filter(
          (persona) => !destroyedPersonaIdsRef.current.has(persona.id)
        )
        personaEventsRef.current.forEach((event) => {
          if (event.type === 'created') {
            reconciledPersonas = [
              ...reconciledPersonas.filter(
                (persona) => persona.id !== event.persona.id
              ),
              event.persona
            ]
            return
          }

          const destroyedPersona = reconciledPersonas.find(
            (persona) => persona.id === event.personaId
          )
          if (destroyedPersona && !event.announced) {
            injectLocal(
              `*** @${destroyedPersona.name.toUpperCase()} HAS BEEN DESTROYED`
            )
          }
          reconciledPersonas = reconciledPersonas.filter(
            (persona) => persona.id !== event.personaId
          )
        })
        personaLoadingRef.current = false
        personaEventsRef.current = []
        replacePersonas(reconciledPersonas)
      })
      .catch((error: unknown) => {
        personaLoadingRef.current = false
        personaEventsRef.current = []
        console.error('Failed to load personas:', error)
        injectLocal(`Persona registry unavailable: ${errorMessage(error)}`)
      })
  }, [isConnected, roomKey])

  const ASCII_WOMEN = [
    `
    .-"""-.
   /        \\
  |  O    O  |
  |    __    |
   \\  (__)  /
    '------'
   /|      |\\
  / |  ||  | \\
 /  |  ||  |  \\
    |__|  |__|
    |  |  |  |
   / \\ |  | / \\
  /   \\|  |/   \\
`,
    `
   ╔══╗
   ║♥♥║
   ╚══╝
  ╭─────╮
  │ ◠ ◠ │
  │  ▽  │
  ╰─────╯
  ╭──┴──╮
  │     │
  ╰──┬──╯
   ┌─┴─┐
   │   │
   └───┘
`,
    `
    *  *
   * .. *
  *  __  *
 * /    \\ *
* | girl | *
 *  \\  /  *
  *  \\/  *
   * || *
   * || *
  *  /\\  *
 *  /  \\  *
`,
    `
  \\   /
   \\ /
  (o o)
   ) (
  /|_|\\
 / | | \\
   | |
  _| |_
 (_____)
`,
    `
   .~.
   /V\\
  // \\\\
 /(   )\\
  ^"~"^
  |   |
 /|   |\\
/ |   | \\
  |   |
 / \\ / \\
`,
  ]

  const COMMANDS = [
    { cmd: 'CLEAR', desc: 'Reset the screen and print ZX startup line' },
    { cmd: '/news',   desc: 'Fetch the latest BBC headline now' },
    { cmd: '/crypto', desc: 'Fetch the latest BTC price now' },
    { cmd: '/invoke', desc: 'Create a persona from a description' },
    { cmd: '/destroy', desc: 'Destroy a persona by name' },
    { cmd: '/p0rn',   desc: 'Post a surprise ASCII art in the room' },
    { cmd: '/clear',  desc: 'Remove all messages from the room' },
    { cmd: '/?',      desc: 'Show this help' },
  ]

  const respondToMentions = async (
    messageId: string,
    content: string,
    speakerUsername: string,
    speakerUserId: string
  ) => {
    if (handledMentionMessageIdsRef.current.has(messageId)) return
    handledMentionMessageIdsRef.current.add(messageId)

    const speakerNameLower = speakerUsername.toLocaleLowerCase()
    const mentionedPersonas = findMentionedPersonas(content, personasRef.current).filter(
      (persona) => persona.name.toLocaleLowerCase() !== speakerNameLower
    )
    if (!mentionedPersonas.length) return

    const context = buildPersonaContext(messages, {
      username: speakerUsername,
      content
    })
    await Promise.all(
      mentionedPersonas.map(async (persona) => {
        if (speakerUserId === `${PERSONA_USER_ID_PREFIX}${persona.id}`) return
        injectLocal(`@${persona.name} is thinking...`)
        try {
          const response = await requestPersonaReply(
            persona,
            content,
            context,
            roomKey
          )
          const ciphertext = await roomKey.encrypt(
            JSON.stringify({
              kind: 'persona',
              name: persona.name,
              content: response
            })
          )
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('Disconnected before the persona could respond')
          }
          ws.send(
            JSON.stringify({
              type: 'persona_message',
              persona_id: persona.id,
              key_space_id: roomKey.keySpaceId,
              content: ciphertext
            })
          )
        } catch (error) {
          injectLocal(`@${persona.name} could not respond: ${errorMessage(error)}`)
        }
      })
    )
  }

  const resetChatRoom = async () => {
    const personasToDestroy = [...personasRef.current]
    const destroyResults = await Promise.allSettled(
      personasToDestroy.map(async (persona) => destroyPersona(persona, roomKey))
    )
    const destroyFailures = destroyResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (destroyFailures.length) {
      injectLocal(`Failed to destroy ${destroyFailures.length} persona(s) during reset`)
    }

    const clearResponse = await fetch('/api/messages', { method: 'DELETE' }).catch((error) => {
      injectLocal(`Room reset failed: ${errorMessage(error)}`)
      return null
    })
    if (!clearResponse) return
    if (!clearResponse.ok) {
      injectLocal('Room reset failed: could not clear messages')
      return
    }

    setDropError(null)
    setPendingFile(null)
    setMessages([
      {
        id: randomId(),
        type: 'system',
        text: 'UNCONTROLLED CHAT v1.0 (C) 2024',
      },
    ])
  }

  const handleSendMessage = async (content: string) => {
    const cmd = content.trim()

    if (cmd.toUpperCase() === 'CLEAR') {
      await resetChatRoom()
      return
    }

    if (cmd === '/?') {
      const lines = ['Available commands:', ...COMMANDS.map((c) => `  ${c.cmd.padEnd(10)} — ${c.desc}`)]
      injectLocal(lines.join('\n'))
      return
    }

    if (cmd === '/invoke' || cmd.startsWith('/invoke ')) {
      const description = cmd.slice('/invoke'.length).trim()
      if (!description) {
        injectLocal('Usage: /invoke <persona description>')
        return
      }

      injectLocal('Invoking a new persona with Copilot...')
      try {
        await invokePersona(
          description,
          participant.username,
          personasRef.current.map((persona) => persona.name),
          roomKey
        )
      } catch (error) {
        injectLocal(`Persona invocation failed: ${errorMessage(error)}`)
      }
      return
    }

    if (cmd === '/destroy' || cmd.startsWith('/destroy ')) {
      const requestedName = cmd
        .slice('/destroy'.length)
        .trim()
        .replace(/^@/, '')
      if (!requestedName) {
        injectLocal('Usage: /destroy <personaName>')
        return
      }

      const persona = personasRef.current.find(
        (current) => current.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase()
      )
      if (!persona) {
        injectLocal(`Persona not found: @${requestedName}`)
        return
      }

      try {
        await destroyPersona(persona, roomKey)
      } catch (error) {
        injectLocal(`Persona destruction failed: ${errorMessage(error)}`)
      }
      return
    }

    if (cmd === '/p0rn') {
      const art = ASCII_WOMEN[Math.floor(Math.random() * ASCII_WOMEN.length)]
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const ciphertext = await roomKey.encrypt(art)
      ws.send(JSON.stringify({ type: 'message', content: ciphertext }))
      return
    }

    if (cmd === '/clear') {
      await resetChatRoom()
      return
    }

    if (cmd === '/news') {
      await fetch('/api/news', { method: 'POST' }).catch(console.error)
      return
    }

    if (cmd === '/crypto') {
      await fetch('/api/crypto', { method: 'POST' }).catch(console.error)
      return
    }

    if (cmd.startsWith('/')) {
      injectLocal(`Unknown command: ${cmd}  (type /? for help)`)
      return
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const ciphertext = await roomKey.encrypt(content)
    ws.send(JSON.stringify({ type: 'message', content: ciphertext }))
    await respondToMentions(
      `local:${randomId()}`,
      content,
      participant.username,
      participant.id
    )
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

  const handleDestroyPersonaClick = async (persona: Persona) => {
    if (destroyingPersonaIds.has(persona.id)) return
    setDestroyingPersonaIds((prev) => new Set(prev).add(persona.id))
    try {
      await destroyPersona(persona, roomKey)
    } catch (error) {
      injectLocal(`Persona destruction failed: ${errorMessage(error)}`)
    } finally {
      setDestroyingPersonaIds((prev) => {
        const next = new Set(prev)
        next.delete(persona.id)
        return next
      })
    }
  }

  const handlePersonaSingleClick = (persona: Persona) => {
    if (personaClickTimerRef.current) {
      clearTimeout(personaClickTimerRef.current)
    }
    personaClickTimerRef.current = setTimeout(() => {
      chatInputRef.current?.appendText(`@${persona.name}`)
      personaClickTimerRef.current = null
    }, PERSONA_SINGLE_CLICK_DELAY_MS)
  }

  const handlePersonaDoubleClick = (persona: Persona) => {
    if (personaClickTimerRef.current) {
      clearTimeout(personaClickTimerRef.current)
      personaClickTimerRef.current = null
    }
    void handleDestroyPersonaClick(persona)
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

  const handlePageClickFocusInput = () => {
    chatInputRef.current?.focus()
  }

  return (
    <div
      className="chat-box"
      onClickCapture={handlePageClickFocusInput}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="chat-header">
        <div>
          <p className="user-info">
            NICK: <strong>{participant.username.toUpperCase()}</strong>
          </p>
          <p className="user-info">
            PERSONAS:{' '}
            <strong>
              {personas.length
                ? personas.map((persona, index) => (
                  <span key={persona.id}>
                    <button
                      type="button"
                      className="persona-chip-btn"
                      disabled={destroyingPersonaIds.has(persona.id)}
                      onClick={() => handlePersonaSingleClick(persona)}
                      onDoubleClick={() => handlePersonaDoubleClick(persona)}
                      title={`Click: insert @${persona.name} • Double-click: destroy`}
                    >
                      @{persona.name}
                    </button>
                    {index < personas.length - 1 ? ', ' : ''}
                  </span>
                ))
                : 'NONE'}
            </strong>
          </p>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          /QUIT
        </button>
      </div>
      <MessageList messages={messages} />
      <ChatInput
        ref={chatInputRef}
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
