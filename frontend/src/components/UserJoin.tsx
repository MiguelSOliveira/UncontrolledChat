import { useState } from 'react'
import { RoomKey } from '../crypto/roomKey'
import './UserJoin.css'

interface Participant {
  id: string
  username: string
}

interface UserJoinProps {
  onUserJoined: (participant: Participant, roomKey: RoomKey) => void
}

export default function UserJoin({ onUserJoined }: UserJoinProps) {
  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('Username cannot be empty')
      return
    }
    if (!passphrase.trim()) {
      setError('Room passphrase cannot be empty')
      return
    }

    setLoading(true)
    try {
      const roomKey = await RoomKey.fromPassphrase(passphrase)

      const response = await fetch(
        `/api/participants?username=` + encodeURIComponent(username),
        {
          method: 'POST'
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to join chat')
      }

      const participant = await response.json()
      onUserJoined(participant, roomKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="user-join-container">
      <div className="user-join-card">
        <h2>🔒 Join Encrypted Chat</h2>
        <p className="hint">
          Enter your username and a room passphrase. Everyone with the same
          passphrase can read each other's messages. The server never sees your
          messages.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
            disabled={loading}
            autoFocus
          />
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Room passphrase"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Joining...' : 'Join Chat'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
