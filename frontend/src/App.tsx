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

function playLoadSound() {
  // Pick a random start point, leaving 2s before the end
  const duration = audio.duration || 30  // fallback until metadata loads
  const maxStart = Math.max(0, duration - 2)
  audio.currentTime = Math.random() * maxStart
  audio.play().catch(() => {/* autoplay blocked until first user interaction */})
  setTimeout(() => {
    audio.pause()
  }, 2000)
}

function App() {
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [roomKey, setRoomKey] = useState<RoomKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMessageReceived = useCallback(() => {
    if (soundEnabled) playLoadSound()
    setLoading(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLoading(false), 2000)
  }, [soundEnabled])

  return (
    <div className={`spectrum-border${loading ? ' loading' : ''}`}>
      <div className="app">
        <header>
          <h1>UNCONTROLLED CHAT v1.0  (C) 2024</h1>
          <button
            className="sound-toggle-btn"
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
