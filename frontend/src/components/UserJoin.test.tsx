import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import UserJoin from './UserJoin'

const { fromPassphraseMock } = vi.hoisted(() => ({
  fromPassphraseMock: vi.fn(),
}))

vi.mock('../crypto/roomKey', () => ({
  RoomKey: {
    fromPassphrase: fromPassphraseMock,
  },
}))

describe('UserJoin', () => {
  it('renders the join form and security hint text', () => {
    render(<UserJoin onUserJoined={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '* ENCRYPTED CHAT *' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Room passphrase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Chat' })).toBeInTheDocument()
    expect(screen.getByText(/SERVER SEES ONLY CIPHERTEXT/i)).toBeInTheDocument()
  })

  it('shows validation errors for missing username and missing passphrase', async () => {
    render(<UserJoin onUserJoined={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))
    expect(await screen.findByText('Username cannot be empty')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Your username'), {
      target: { value: 'alice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))
    expect(await screen.findByText('Room passphrase cannot be empty')).toBeInTheDocument()
  })

  it('joins successfully and calls onUserJoined with participant and room key', async () => {
    const fakeRoomKey = { encrypt: vi.fn() }
    const onUserJoined = vi.fn()
    fromPassphraseMock.mockResolvedValue(fakeRoomKey)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'p1', username: 'alice' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<UserJoin onUserJoined={onUserJoined} />)

    fireEvent.change(screen.getByPlaceholderText('Your username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Room passphrase'), {
      target: { value: 'banana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))

    await waitFor(() => {
      expect(onUserJoined).toHaveBeenCalledWith({ id: 'p1', username: 'alice' }, fakeRoomKey)
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/participants?username=alice', {
      method: 'POST',
    })
  })
})
