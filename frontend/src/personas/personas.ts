import { RoomKey } from '../crypto/roomKey'

export interface Persona {
  id: string
  name: string
  description: string
  invokedBy: string
  createdAt: string
}

export interface PersonaContextMessage {
  username: string
  content: string
}

export interface PersonaRecordWire {
  id: string
  ciphertext: string
  created_at: string
}

interface PersonaDefinition {
  name: string
  description: string
  invokedBy: string
}

interface GeneratedPersona {
  name: string
}

interface PersonaReply {
  content: string
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readApiError(value: unknown, fallback: string): string {
  if (isStringRecord(value) && typeof value.detail === 'string') {
    return value.detail
  }

  return fallback
}

async function readJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readApiError(payload, `Request failed (${response.status})`))
  }

  return payload
}

function parseGeneratedPersona(value: unknown): GeneratedPersona {
  if (!isStringRecord(value) || typeof value.name !== 'string') {
    throw new Error('Copilot returned an invalid persona name')
  }

  return { name: value.name }
}

function parsePersonaReply(value: unknown): PersonaReply {
  if (!isStringRecord(value) || typeof value.content !== 'string') {
    throw new Error('Copilot returned an invalid persona response')
  }

  return { content: value.content }
}

function parsePersonaDefinition(value: unknown): PersonaDefinition {
  if (
    !isStringRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.invokedBy !== 'string'
  ) {
    throw new Error('Persona definition is invalid')
  }

  return {
    name: value.name,
    description: value.description,
    invokedBy: value.invokedBy
  }
}

export async function decryptPersona(
  record: PersonaRecordWire,
  roomKey: RoomKey
): Promise<Persona> {
  const plaintext = await roomKey.decrypt(record.ciphertext)
  const definition = parsePersonaDefinition(JSON.parse(plaintext) as unknown)

  return {
    id: record.id,
    ...definition,
    createdAt: record.created_at
  }
}

export async function loadPersonas(roomKey: RoomKey): Promise<Persona[]> {
  const response = await fetch(
    `/api/personas?key_space_id=${encodeURIComponent(roomKey.keySpaceId)}`
  )
  const payload = await readJson(response)
  if (!Array.isArray(payload)) {
    throw new Error('Persona registry response is invalid')
  }

  const personas = await Promise.all(
    payload.map(async (record) => {
      if (
        !isStringRecord(record) ||
        typeof record.id !== 'string' ||
        typeof record.ciphertext !== 'string' ||
        typeof record.created_at !== 'string'
      ) {
        return null
      }

      try {
        return await decryptPersona(
          {
            id: record.id,
            ciphertext: record.ciphertext,
            created_at: record.created_at
          },
          roomKey
        )
      } catch {
        return null
      }
    })
  )

  return personas.filter((persona): persona is Persona => persona !== null)
}

export async function invokePersona(
  description: string,
  invokedBy: string,
  existingNames: string[],
  roomKey: RoomKey
): Promise<void> {
  const generatedResponse = await fetch('/api/personas/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description,
      existing_names: existingNames
    })
  })
  const generated = parseGeneratedPersona(await readJson(generatedResponse))
  const definition: PersonaDefinition = {
    name: generated.name,
    description,
    invokedBy
  }
  const ciphertext = await roomKey.encrypt(JSON.stringify(definition))
  const nameToken = await roomKey.personaNameToken(generated.name)
  const storeResponse = await fetch('/api/personas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key_space_id: roomKey.keySpaceId,
      name_token: nameToken,
      ciphertext
    })
  })

  await readJson(storeResponse)
}

export async function destroyPersona(
  persona: Persona,
  roomKey: RoomKey
): Promise<void> {
  const response = await fetch(
    `/api/personas/${encodeURIComponent(persona.id)}?key_space_id=${encodeURIComponent(roomKey.keySpaceId)}`,
    { method: 'DELETE' }
  )

  await readJson(response)
}

export async function requestPersonaReply(
  persona: Persona,
  mention: string,
  context: PersonaContextMessage[],
  roomKey: RoomKey
): Promise<string> {
  const response = await fetch(`/api/personas/${encodeURIComponent(persona.id)}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key_space_id: roomKey.keySpaceId,
      name: persona.name,
      description: persona.description,
      mention,
      context
    })
  })

  return parsePersonaReply(await readJson(response)).content
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findMentionedPersonas(content: string, personas: Persona[]): Persona[] {
  return personas.filter((persona) => {
    const mention = new RegExp(
      `(^|\\s)@${escapeRegExp(persona.name)}(?=\\s|[.,!?;:]|$)`,
      'i'
    )

    return mention.test(content)
  })
}
