import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  generateTotp,
  hotp,
  parseTotpInput,
  type TotpAlgorithm,
  tryParseTotpInput,
} from './totp'

// RFC 4648 base32 test vectors — these exercise the non-byte-boundary cases
// (1, 2, 3, 4 byte inputs) where base32 decoders commonly break.
describe('base32Decode', () => {
  const vectors: [string, string][] = [
    ['MY======', 'f'],
    ['MZXQ====', 'fo'],
    ['MZXW6===', 'foo'],
    ['MZXW6YQ=', 'foob'],
    ['MZXW6YTB', 'fooba'],
    ['MZXW6YTBOI======', 'foobar'],
  ]
  it.each(vectors)('decodes %s -> %s', (encoded, expected) => {
    expect(new TextDecoder().decode(base32Decode(encoded))).toBe(expected)
  })
  it('is case- and whitespace-insensitive', () => {
    expect(new TextDecoder().decode(base32Decode('mz xw 6y tb'))).toBe('fooba')
  })
  it('throws on characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW6Y18')).toThrow() // '1' and '8' are not base32
  })
})

// RFC 6238 Appendix B test vectors (8-digit codes). The shared secrets are the
// ASCII digit string repeated to the hash's block size — fed as raw key bytes
// so this validates HMAC + dynamic truncation independent of base32.
const KEYS: Record<TotpAlgorithm, Uint8Array> = {
  'SHA-1': new TextEncoder().encode('12345678901234567890'),
  'SHA-256': new TextEncoder().encode('12345678901234567890123456789012'),
  'SHA-512': new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234'),
}

function counterFor(timeSeconds: number, period = 30): bigint {
  return BigInt(Math.floor(timeSeconds / period))
}

describe('hotp — RFC 6238 vectors', () => {
  const cases: [number, TotpAlgorithm, string][] = [
    [59, 'SHA-1', '94287082'],
    [1111111109, 'SHA-1', '07081804'],
    [1111111111, 'SHA-1', '14050471'],
    [1234567890, 'SHA-1', '89005924'],
    [2000000000, 'SHA-1', '69279037'],
    [20000000000, 'SHA-1', '65353130'],
    [59, 'SHA-256', '46119246'],
    [20000000000, 'SHA-256', '77737706'],
    [59, 'SHA-512', '90693936'],
    [20000000000, 'SHA-512', '47863826'],
  ]
  it.each(cases)('T=%d %s -> %s', async (time, algorithm, expected) => {
    const code = await hotp(KEYS[algorithm], counterFor(time), { digits: 8, algorithm })
    expect(code).toBe(expected)
  })
})

describe('generateTotp', () => {
  it('matches an RFC 6238 vector through the base32 pipeline', async () => {
    // base32 of the ASCII SHA-1 secret "12345678901234567890".
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const res = await generateTotp({ secret, digits: 8, period: 30, algorithm: 'SHA-1' }, 59 * 1000)
    expect(res.code).toBe('94287082')
    expect(res.secondsRemaining).toBe(1) // 30 - (59 % 30)
  })

  it('produces a standard 6-digit code', async () => {
    const res = await generateTotp(
      { secret: 'GEZDGNBVGY3TQOJQ', digits: 6, period: 30, algorithm: 'SHA-1' },
      0,
    )
    expect(res.code).toMatch(/^\d{6}$/)
    expect(res.secondsRemaining).toBe(30)
  })
})

describe('parseTotpInput', () => {
  it('parses an otpauth:// URI with full params', () => {
    const cfg = parseTotpInput(
      'otpauth://totp/GitHub:me@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub&digits=6&period=30&algorithm=SHA1',
    )
    expect(cfg).toMatchObject({
      secret: 'GEZDGNBVGY3TQOJQ',
      digits: 6,
      period: 30,
      algorithm: 'SHA-1',
      issuer: 'GitHub',
      account: 'me@example.com',
    })
  })

  it('treats a bare base32 string as the secret with defaults (uppercased)', () => {
    const cfg = parseTotpInput('gezd gnbv gy3t qojq')
    expect(cfg).toMatchObject({ secret: 'GEZDGNBVGY3TQOJQ', digits: 6, period: 30, algorithm: 'SHA-1' })
  })

  it('honors SHA-256 from the URI', () => {
    expect(parseTotpInput('otpauth://totp/x?secret=GEZDGNBVGY3TQOJQ&algorithm=SHA256').algorithm).toBe('SHA-256')
  })

  it('rejects unusable input via tryParseTotpInput', () => {
    expect(tryParseTotpInput('not a key !!!')).toBeNull()
    expect(tryParseTotpInput('otpauth://hotp/x?secret=GEZDGNBVGY3TQOJQ')).toBeNull() // HOTP not supported
    expect(tryParseTotpInput('GEZDGNBVGY3TQOJQ')).not.toBeNull()
  })
})
