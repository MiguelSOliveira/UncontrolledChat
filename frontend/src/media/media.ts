import { RoomKey } from '../crypto/roomKey'

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024 // 10 MB
export const ACCEPTED_MIME = 'image/*,video/*'

export interface MediaPayload {
  name: string
  mime: string
  caption: string
  size: number
  dataB64: string
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function isAcceptedFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

export async function encryptFile(
  file: File,
  caption: string,
  roomKey: RoomKey
): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const payload: MediaPayload = {
    name: file.name,
    mime: file.type || 'application/octet-stream',
    caption,
    size: file.size,
    dataB64: bytesToB64(buffer)
  }
  const envelope = new TextEncoder().encode(JSON.stringify(payload))

  return roomKey.encryptBytes(envelope)
}

export async function decryptMedia(
  ciphertext: string,
  roomKey: RoomKey
): Promise<MediaPayload & { objectUrl: string }> {
  const bytes = await roomKey.decryptBytes(ciphertext)
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as MediaPayload
  const fileBytes = b64ToBytes(payload.dataB64)
  const blob = new Blob([fileBytes as BlobPart], { type: payload.mime })
  const objectUrl = URL.createObjectURL(blob)

  return { ...payload, objectUrl }
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
