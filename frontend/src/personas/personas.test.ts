import { vi } from 'vitest'

import { RoomKey } from '../crypto/roomKey'
import {
  destroyPersona,
  findMentionedPersonas,
  invokePersona,
  loadPersonas,
  Persona,
  requestPersonaReply
} from './personas'

const personas: Persona[] = [
  {
    id: 'p1',
    name: 'Oracle',
    description: 'A mysterious oracle',
    invokedBy: 'alice',
    createdAt: '2026-07-15T12:00:00Z'
  },
  {
    id: 'p2',
    name: 'Byte-Bard',
    description: 'A bard for programmers',
    invokedBy: 'bob',
    createdAt: '2026-07-15T12:01:00Z'
  }
]

describe('findMentionedPersonas', () => {
  it('matches complete persona mentions case-insensitively', () => {
    expect(
      findMentionedPersonas('Ask @oracle, then @Byte-Bard!', personas).map(
        (persona) => persona.name
      )
    ).toEqual(['Oracle', 'Byte-Bard'])
  })

  it('does not match a persona name embedded in a longer mention', () => {
    expect(findMentionedPersonas('Hello @OracleExtra', personas)).toEqual([])
  })
})

describe('persona API', () => {
  let roomKey: RoomKey
  const fetchMock = vi.fn()

  beforeAll(async () => {
    roomKey = await RoomKey.fromPassphrase('banana')
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and decrypts Persona definitions for the current Key Space', async () => {
    const ciphertext = await roomKey.encrypt(
      JSON.stringify({
        name: 'Oracle',
        description: 'A mysterious oracle',
        invokedBy: 'alice'
      })
    )
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([
        {
          id: 'p1',
          ciphertext,
          created_at: '2026-07-15T12:00:00Z'
        }
      ])
    })

    const loaded = await loadPersonas(roomKey)

    expect(loaded).toEqual([personas[0]])
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/personas?key_space_id=${roomKey.keySpaceId}`
    )
  })

  it('generates, encrypts, and stores an invoked Persona', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ name: 'Oracle' })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: 'persona-1' })
      })

    await invokePersona(
      'A mysterious oracle',
      'alice',
      ['Sage'],
      roomKey
    )

    const storeOptions = fetchMock.mock.calls[1][1]
    if (typeof storeOptions?.body !== 'string') {
      throw new Error('Expected a JSON request body')
    }
    const storedRequest: unknown = JSON.parse(storeOptions.body)
    expect(storedRequest).toMatchObject({
      key_space_id: roomKey.keySpaceId,
      name_token: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
  })

  it('destroys a Persona and requests an in-character reply', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ content: 'The stars say yes.' })
      })

    await destroyPersona(personas[0], roomKey)
    const reply = await requestPersonaReply(
      personas[0],
      '@Oracle should we go?',
      [{ username: 'alice', content: 'The path is dark.' }],
      roomKey
    )

    expect(reply).toBe('The stars say yes.')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/personas/p1?key_space_id=')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/personas/p1/respond')
  })
})
