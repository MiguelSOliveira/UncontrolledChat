import { useState } from 'react'
import './App.css'
import UserJoin from './components/UserJoin'
import ChatBox from './components/ChatBox'
import { RoomKey } from './crypto/roomKey'

interface User {
  id: string
  username: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [roomKey, setRoomKey] = useState<RoomKey | null>(null)

  return (
    <div className="app">
      <header>
        <h1>UncontrolledChat 🔒</h1>
      </header>
      <main>
        {!user || !roomKey ? (
          <UserJoin
            onUserJoined={(u, k) => {
              setUser(u)
              setRoomKey(k)
            }}
          />
        ) : (
          <ChatBox
            user={user}
            roomKey={roomKey}
            onLogout={() => {
              setUser(null)
              setRoomKey(null)
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
