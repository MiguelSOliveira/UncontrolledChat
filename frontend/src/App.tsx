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
let audioPosition = 0

function playLoadSound() {
  audio.currentTime = audioPosition
  audio.play().catch(() => {/* autoplay blocked until first user interaction */})
  setTimeout(() => {
    audioPosition = audio.currentTime  // remember where we stopped
    audio.pause()
    // wrap around if we've reached the end
    if (audioPosition >= audio.duration || isNaN(audio.duration)) {
      audioPosition = 0
    }
  }, 2000)
}

function App() {
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [roomKey, setRoomKey] = useState<RoomKey | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMessageReceived = useCallback(() => {
    playLoadSound()
    setLoading(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLoading(false), 2000)
  }, [])

  return (
    <div className={`spectrum-border${loading ? ' loading' : ''}`}>
      <div className="app">
        <header>
          <h1>UNCONTROLLED CHAT v1.0  (C) 2024</h1>
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
