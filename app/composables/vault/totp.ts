// RFC 6238 (TOTP) / RFC 4226 (HOTP) — dependency-free, Web Crypto based.
//
// Turns a stored authenticator "setup key" (an `otpauth://` URI or a bare
// base32 secret) into the current rotating one-time code, so the vault can act
// as a TOTP authenticator for a saved account. `crypto.subtle` is async, so
// every code-producing function returns a Promise — callers (composable + the
// ticking-code display) must await.

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpConfig {
  /** Base32-encoded shared secret (uppercased, padding/space stripped). */
  secret: string
  digits: number
  period: number
  algorithm: TotpAlgorithm
  /** Human labels parsed from an `otpauth://` URI, when present. */
  issuer?: string
  account?: string
}

export interface TotpResult {
  code: string
  /** Seconds left before this code rotates. */
  secondsRemaining: number
  period: number
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const DEFAULTS = { digits: 6, period: 30, algorithm: 'SHA-1' as TotpAlgorithm }

/** Decode RFC 4648 base32 (case-insensitive, padding/whitespace tolerant). */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=]+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error(`invalid base32 character: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

function normalizeAlgorithm(raw: string | null | undefined): TotpAlgorithm {
  switch ((raw ?? 'SHA1').toUpperCase().replace(/-/g, '')) {
    case 'SHA256': return 'SHA-256'
    case 'SHA512': return 'SHA-512'
    default: return 'SHA-1'
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** RFC 4226 HOTP for an explicit counter and raw key bytes. */
export async function hotp(
  key: Uint8Array,
  counter: bigint,
  opts: { digits: number, algorithm: TotpAlgorithm },
): Promise<string> {
  const counterBytes = new Uint8Array(8)
  new DataView(counterBytes.buffer).setBigUint64(0, counter, false)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: opts.algorithm },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBytes as BufferSource))
  // RFC 4226 dynamic truncation.
  const offset = sig[sig.length - 1]! & 0x0f
  const bin
    = ((sig[offset]! & 0x7f) << 24)
      | (sig[offset + 1]! << 16)
      | (sig[offset + 2]! << 8)
      | sig[offset + 3]!
  return (bin % 10 ** opts.digits).toString().padStart(opts.digits, '0')
}

/** Current TOTP code for a config. `atMs` defaults to now (injectable for tests). */
export async function generateTotp(config: TotpConfig, atMs: number = Date.now()): Promise<TotpResult> {
  const key = base32Decode(config.secret)
  const seconds = Math.floor(atMs / 1000)
  const counter = BigInt(Math.floor(seconds / config.period))
  const code = await hotp(key, counter, { digits: config.digits, algorithm: config.algorithm })
  return { code, secondsRemaining: config.period - (seconds % config.period), period: config.period }
}

/** Parse an `otpauth://totp/...` URI into a config. Throws if malformed. */
export function parseOtpAuthUri(uri: string): TotpConfig {
  const url = new URL(uri.trim())
  if (url.protocol !== 'otpauth:') throw new Error('not an otpauth URI')
  if (url.host.toLowerCase() !== 'totp') throw new Error('only TOTP is supported')

  const secret = (url.searchParams.get('secret') ?? '').replace(/\s+/g, '').toUpperCase()
  if (!secret) throw new Error('otpauth URI missing secret')
  base32Decode(secret) // validate

  // Label is "Issuer:Account" in the path after the leading slash.
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const colon = label.indexOf(':')
  const labelIssuer = colon === -1 ? '' : label.slice(0, colon).trim()
  const account = (colon === -1 ? label : label.slice(colon + 1)).trim()

  return {
    secret,
    digits: clampInt(url.searchParams.get('digits'), DEFAULTS.digits, 6, 10),
    period: clampInt(url.searchParams.get('period'), DEFAULTS.period, 1, 300),
    algorithm: normalizeAlgorithm(url.searchParams.get('algorithm')),
    issuer: url.searchParams.get('issuer')?.trim() || labelIssuer || undefined,
    account: account || undefined,
  }
}

/** Parse either an `otpauth://` URI or a bare base32 secret into a config. */
export function parseTotpInput(input: string): TotpConfig {
  const trimmed = input.trim()
  if (/^otpauth:\/\//i.test(trimmed)) return parseOtpAuthUri(trimmed)
  const secret = trimmed.replace(/\s+/g, '').toUpperCase()
  base32Decode(secret) // throws on invalid
  return { secret, ...DEFAULTS }
}

/** Non-throwing variant for validating user input. Returns null if unusable. */
export function tryParseTotpInput(input: string): TotpConfig | null {
  try {
    return parseTotpInput(input)
  }
  catch {
    return null
  }
}

/** Convenience: stored setup key → live code + parsed labels. */
export async function totpFromSetupKey(
  setupKey: string,
  atMs?: number,
): Promise<TotpResult & { issuer?: string, account?: string }> {
  const config = parseTotpInput(setupKey)
  const res = await generateTotp(config, atMs)
  return { ...res, issuer: config.issuer, account: config.account }
}
