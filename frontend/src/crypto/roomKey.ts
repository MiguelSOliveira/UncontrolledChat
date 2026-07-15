/**
 * AES-GCM shared-key encryption for a chat room.
 *
 * The key is derived from a user-supplied passphrase via PBKDF2 with a fixed
 * app-wide salt. This means the same passphrase always yields the same key, so
 * two users typing the same passphrase can decrypt each other's messages.
 *
 * The server only ever sees base64(iv || ciphertext) and cannot decrypt.
 */

const APP_SALT = new TextEncoder().encode('uncontrolled-chat-v1')
const PBKDF2_ITERATIONS = 200_000
const AES_KEY_LEN = 256
const IV_LEN = 12
const KEY_SPACE_LABEL = new TextEncoder().encode('uncontrolled-chat-key-space-v1')

function ensureCryptoSubtle(): SubtleCrypto {
  if (!crypto?.subtle) {
    throw new Error(
      'Web Crypto API is not available. This usually means the page is not served over HTTPS or a secure context. ' +
      'Try accessing over HTTPS or ensure your browser supports Web Crypto.'
    )
  }
  return crypto.subtle
}

interface DerivedKeys {
  encryptionKey: CryptoKey
  identityKey: CryptoKey
  keySpaceId: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function deriveKeys(passphrase: string): Promise<DerivedKeys> {
  const subtle = ensureCryptoSubtle()
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const keyBytes = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: APP_SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    AES_KEY_LEN
  )
  const encryptionKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: AES_KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  )
  const identityKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const keySpaceSignature = await subtle.sign('HMAC', identityKey, KEY_SPACE_LABEL)

  return {
    encryptionKey,
    identityKey,
    keySpaceId: bytesToHex(new Uint8Array(keySpaceSignature))
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export class RoomKey {
  private constructor(
    private readonly key: CryptoKey,
    private readonly identityKey: CryptoKey,
    readonly keySpaceId: string
  ) {}

  static async fromPassphrase(passphrase: string): Promise<RoomKey> {
    const { encryptionKey, identityKey, keySpaceId } = await deriveKeys(passphrase)

    return new RoomKey(encryptionKey, identityKey, keySpaceId)
  }

  async encrypt(plaintext: string): Promise<string> {
    return this.encryptBytes(new TextEncoder().encode(plaintext))
  }

  async decrypt(payload: string): Promise<string> {
    const pt = await this.decryptBytes(payload)
    return new TextDecoder().decode(pt)
  }

  async personaNameToken(name: string): Promise<string> {
    const normalizedName = name.trim().toLocaleLowerCase()
    const signature = await ensureCryptoSubtle().sign(
      'HMAC',
      this.identityKey,
      new TextEncoder().encode(`persona:${normalizedName}`)
    )

    return bytesToHex(new Uint8Array(signature))
  }

  async encryptBytes(bytes: Uint8Array): Promise<string> {
    const subtle = ensureCryptoSubtle()
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const ct = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv }, this.key, bytes as BufferSource)
    )
    const combined = new Uint8Array(iv.length + ct.length)
    combined.set(iv, 0)
    combined.set(ct, iv.length)
    return bytesToB64(combined)
  }

  async decryptBytes(payload: string): Promise<Uint8Array> {
    const subtle = ensureCryptoSubtle()
    const combined = b64ToBytes(payload)
    const iv = combined.slice(0, IV_LEN)
    const ct = combined.slice(IV_LEN)
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, this.key, ct)
    return new Uint8Array(pt)
  }
}
