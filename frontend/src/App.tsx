import { useState } from 'react'
import './App.css'
import UserJoin from './components/UserJoin'
import ChatBox from './components/ChatBox'
import { RoomKey } from './crypto/roomKey'

interface Participant {
  id: string
  username: string
}

function App() {
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [roomKey, setRoomKey] = useState<RoomKey | null>(null)

  return (
    <div className="app">
      <header>
        <h1>UncontrolledChat 🔒</h1>
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
          />
        )}
      </main>
    </div>
  )
}

export default App
