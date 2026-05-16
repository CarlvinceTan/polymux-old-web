import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// HMAC-signed, opaque state token used during OAuth handshakes. Five-minute
// expiry; nonce is also written to a http-only cookie so the callback can
// double-check that the state we receive is the one we issued (CSRF defence).
//
// Format: base64url(payload).base64url(hmac_sha256(secret, payload))
// Payload is JSON: { workspace_id, user_id, provider, migrate, nonce, exp }.
//
// We don't pull in `jose`/`jsonwebtoken` for this — a single-purpose 5-minute
// handshake doesn't need a full JWT validator surface; the homegrown payload
// keeps the dep tree small.

const TTL_SECONDS = 60 * 5
export const STATE_COOKIE = 'polymux_oauth_nonce'

interface OAuthStatePayload {
  workspace_id: string
  user_id: string
  provider: string
  migrate: boolean
  nonce: string
  exp: number
}

function resolveSecret(): Buffer {
  const secret = useRuntimeConfig().oauthStateSecret
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      '[oauthState] OAUTH_STATE_SECRET is not set or too short. '
      + 'Generate a 32-byte hex secret: `openssl rand -hex 32`.',
    )
  }
  return Buffer.from(secret, 'utf8')
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export interface IssueStateInput {
  workspaceId: string
  userId: string
  provider: string
  migrate: boolean
}

export interface IssueStateResult {
  state: string
  nonce: string
}

export function issueOAuthState(input: IssueStateInput): IssueStateResult {
  const nonce = randomBytes(24).toString('hex')
  const payload: OAuthStatePayload = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    provider: input.provider,
    migrate: input.migrate,
    nonce,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  }
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = createHmac('sha256', resolveSecret()).update(payloadBuf).digest()
  return { state: `${b64urlEncode(payloadBuf)}.${b64urlEncode(sig)}`, nonce }
}

export function verifyOAuthState(state: string, expectedNonce: string): OAuthStatePayload {
  const parts = state.split('.')
  if (parts.length !== 2) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed OAuth state.' })
  }
  const [payloadEnc, sigEnc] = parts as [string, string]
  const payloadBuf = b64urlDecode(payloadEnc)
  const presentedSig = b64urlDecode(sigEnc)
  const expectedSig = createHmac('sha256', resolveSecret()).update(payloadBuf).digest()
  if (presentedSig.length !== expectedSig.length || !timingSafeEqual(presentedSig, expectedSig)) {
    throw createError({ statusCode: 400, statusMessage: 'OAuth state signature mismatch.' })
  }

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(payloadBuf.toString('utf8')) as OAuthStatePayload
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed OAuth state payload.' })
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'OAuth state expired. Try connecting again.' })
  }

  if (payload.nonce !== expectedNonce) {
    throw createError({ statusCode: 400, statusMessage: 'OAuth nonce mismatch.' })
  }

  return payload
}
