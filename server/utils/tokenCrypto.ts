import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12
const VERSION = 'v1'

function resolveKey(): Buffer {
  const hex = useRuntimeConfig().integrationEncryptionKey
  if (!hex || typeof hex !== 'string') {
    throw new Error(
      '[tokenCrypto] INTEGRATION_ENCRYPTION_KEY is not set. '
      + 'Generate a 32-byte key (64 hex chars): `openssl rand -hex 32`.',
    )
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      `[tokenCrypto] INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). `
      + 'Regenerate: `openssl rand -hex 32`.',
    )
  }
  return key
}

export function encryptToken(plain: string): string {
  if (!plain) return ''
  const key = resolveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decryptToken(payload: string): string {
  if (!payload) return ''
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('[tokenCrypto] unsupported ciphertext format')
  }
  const [, ivHex, tagHex, ctHex] = parts
  const key = resolveKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex!, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex!, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex!, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}
