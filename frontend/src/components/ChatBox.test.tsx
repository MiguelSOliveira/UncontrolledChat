import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { RoomKey } from '../crypto/roomKey'
import { Persona } from '../personas/personas'
import ChatBox from './ChatBox'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  loadPersonas: vi.fn(),
  invokePersona: vi.fn(),
  destroyPersona: vi.fn(),
  requestPersonaReply: vi.fn(),
  decryptPersona: vi.fn()
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    ws: {
      readyState: WebSocket.OPEN,
      send: mocks.send
    },
    isConnected: true
  })
}))

vi.mock('../personas/personas', async (importOriginal) => {
  const original = await importOriginal<typeof import('../personas/personas')>()

  return {
    ...original,
    loadPersonas: mocks.loadPersonas,
    invokePersona: mocks.invokePersona,
    destroyPersona: mocks.destroyPersona,
    requestPersonaReply: mocks.requestPersonaReply,
    decryptPersona: mocks.decryptPersona
  }
})

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

const oracle: Persona = {
  id: 'persona-1',
  name: 'Oracle',
  description: 'A mysterious oracle',
  invokedBy: 'alice',
  createdAt: '2026-07-15T12:00:00Z'
}

describe('ChatBox persona commands', () => {
  let roomKey: RoomKey

  beforeAll(async () => {
    roomKey = await RoomKey.fromPassphrase('banana')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadPersonas.mockResolvedValue([])
    mocks.invokePersona.mockResolvedValue(undefined)
    mocks.destroyPersona.mockResolvedValue(undefined)
    mocks.requestPersonaReply.mockResolvedValue('The stars say yes.')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue([])
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderChatBox() {
    return render(
      <ChatBox
        participant={{ id: 'participant-1', username: 'alice' }}
        roomKey={roomKey}
        onLogout={vi.fn()}
      />
    )
  }

  it('invokes a new Copilot persona from a description', async () => {
    const user = userEvent.setup()
    renderChatBox()

    await user.type(screen.getByPlaceholderText('type here...'), '/invoke A mysterious oracle')
    await user.click(screen.getByRole('button', { name: 'SEND' }))

    await waitFor(() => {
      expect(mocks.invokePersona).toHaveBeenCalledWith(
        'A mysterious oracle',
        'alice',
        [],
        roomKey
      )
    })
  })

  it('destroys an existing persona by case-insensitive name', async () => {
    mocks.loadPersonas.mockResolvedValue([oracle])
    const user = userEvent.setup()
    renderChatBox()
    await screen.findByText('@Oracle')

    await user.type(screen.getByPlaceholderText('type here...'), '/destroy oracle')
    await user.click(screen.getByRole('button', { name: 'SEND' }))

    await waitFor(() => {
      expect(mocks.destroyPersona).toHaveBeenCalledWith(oracle, roomKey)
    })
  })

  it('inserts @persona in the input when clicking persona in header list', async () => {
    mocks.loadPersonas.mockResolvedValue([oracle])
    const user = userEvent.setup()
    renderChatBox()
    const personaButton = await screen.findByRole('button', { name: '@Oracle' })

    await user.click(personaButton)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('type here...')).toHaveValue('@Oracle')
    })
    expect(mocks.destroyPersona).not.toHaveBeenCalled()
  })

  it('destroys a persona when double-clicking it in the header list', async () => {
    mocks.loadPersonas.mockResolvedValue([oracle])
    const user = userEvent.setup()
    renderChatBox()
    const personaButton = await screen.findByRole('button', { name: '@Oracle' })

    await user.dblClick(personaButton)

    await waitFor(() => {
      expect(mocks.destroyPersona).toHaveBeenCalledWith(oracle, roomKey)
    })
  })

  it('requests and broadcasts an encrypted response for a mentioned persona', async () => {
    mocks.loadPersonas.mockResolvedValue([oracle])
    const user = userEvent.setup()
    renderChatBox()
    await screen.findByText('@Oracle')

    await user.type(screen.getByPlaceholderText('type here...'), 'Hello @Oracle!')
    await user.click(screen.getByRole('button', { name: 'SEND' }))

    await waitFor(() => {
      expect(mocks.requestPersonaReply).toHaveBeenCalled()
      expect(mocks.send).toHaveBeenCalledTimes(2)
    })
    const personaPayload: unknown = JSON.parse(mocks.send.mock.calls[1][0])
    expect(personaPayload).toMatchObject({
      type: 'persona_message',
      persona_id: 'persona-1'
    })
    expect(personaPayload).not.toMatchObject({ content: 'The stars say yes.' })
  })
})
