import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const from_passphrase_mock = vi.fn()

vi.mock('./crypto/roomKey', () => ({
  RoomKey: {
    fromPassphrase: from_passphrase_mock,
  },
}))

vi.mock('./components/ChatBox', () => ({
  default: ({ participant }: { participant: { username: string } }) => (
    <div>
      <h2>Chat screen ready</h2>
      <p>Logged as {participant.username}</p>
    </div>
  ),
}))

class AudioMock {
  duration = 30
  currentTime = 0
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}

describe('App login flow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('shows the login screen by default', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')

    render(<App />)

    expect(screen.getByRole('heading', { name: /UNCONTROLLED CHAT v1\.0\s+\(C\) 2024/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '* ENCRYPTED CHAT *' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Room passphrase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Chat' })).toBeInTheDocument()
  })

  it('moves from login screen to chat screen after successful join', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    from_passphrase_mock.mockResolvedValue({ decrypt: vi.fn(), encrypt: vi.fn() })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'p1', username: 'alice' }),
      })
    )

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Your username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Room passphrase'), {
      target: { value: 'banana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chat screen ready' })).toBeInTheDocument()
    })
    expect(screen.getByText('Logged as alice')).toBeInTheDocument()
  })
})
