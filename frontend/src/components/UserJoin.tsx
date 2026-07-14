import { useState } from 'react'
import './UserJoin.css'

interface UserJoinProps {
  onUserJoined: (user: { id: string; username: string }) => void
}

export default function UserJoin({ onUserJoined }: UserJoinProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('Username cannot be empty')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/users?username=' + encodeURIComponent(username), {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to join chat')
      }

      const user = await response.json()
      onUserJoined(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="user-join-container">
      <div className="user-join-card">
        <h2>Enter your username</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
            disabled={loading}
            autoFocus
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
