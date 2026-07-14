import { useState, useEffect } from 'react'
import './App.css'
import UserJoin from './components/UserJoin'
import ChatBox from './components/ChatBox'

interface User {
  id: string
  username: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)

  return (
    <div className="app">
      <header>
        <h1>UncontrolledChat</h1>
      </header>
      <main>
        {!user ? (
          <UserJoin onUserJoined={setUser} />
        ) : (
          <ChatBox user={user} onLogout={() => setUser(null)} />
        )}
      </main>
    </div>
  )
}

export default App
