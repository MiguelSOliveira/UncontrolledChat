import { useState, useCallback, useRef } from 'react'
import './App.css'
import UserJoin from './components/UserJoin'
import ChatBox from './components/ChatBox'
import { RoomKey } from './crypto/roomKey'

interface Participant {
  id: string
  username: string
}

const audio = new Audio('/spectrum-load.mp3')

function playLoadSound(durationMs: number) {
  const playSeconds = durationMs / 1000
  // Pick a random start point while leaving enough room for the requested duration.
  const duration = audio.duration || 30  // fallback until metadata loads
  const maxStart = Math.max(0, duration - playSeconds)
  audio.currentTime = Math.random() * maxStart
  audio.loop = true
  audio.play().catch(() => {/* autoplay blocked until first user interaction */})
}

function App() {
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [roomKey, setRoomKey] = useState<RoomKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const soundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMessageReceived = useCallback((charCount: number) => {
    const durationMs = Math.max(1, charCount) * 10
    setLoading(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLoading(false), durationMs)

    if (!soundEnabled) return
    audio.pause()
    audio.loop = false
    if (soundTimerRef.current) clearTimeout(soundTimerRef.current)
    playLoadSound(durationMs)
    soundTimerRef.current = setTimeout(() => {
      audio.pause()
      audio.loop = false
    }, durationMs)
  }, [soundEnabled])

  return (
    <div className={`spectrum-border${loading ? ' loading' : ''}`}>
      <div className="app">
        <header>
          <h1>UNCONTROLLED CHAT v1.0  (C) 2024</h1>
          <button
            className="sound-toggle-btn"
            aria-label="Toggle sound"
            aria-pressed={soundEnabled}
            onClick={() => setSoundEnabled((prev) => !prev)}
          >
            {soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF'}
          </button>
        </header>
        <main>
          {!participant || !roomKey ? (
            <UserJoin
              onUserJoined={(p, k) => {
                setParticipant(p)
                setRoomKey(k)
              }}
            />
          ) : (
            <ChatBox
              participant={participant}
              roomKey={roomKey}
              onLogout={() => {
                setParticipant(null)
                setRoomKey(null)
              }}
              onMessageReceived={handleMessageReceived}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
