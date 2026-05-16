// HMAC signing for integration webhooks (Slack/Stripe-style).
//
// Polymux signs every outbound webhook call to a third-party integration
// with HMAC-SHA256 over `<timestamp>.<body>`, using a per-version signing
// secret that's stored encrypted in `integration_versions.webhook_signing_
// secret_enc`. The integration verifies on its end with the same scheme;
// shared SDK helpers will mirror this code on the author side.
//
// Replay protection: requests with a timestamp older than 5 minutes are
// rejected. The integration is expected to do the same on inbound calls.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'x-polymux-signature'
export const TIMESTAMP_HEADER = 'x-polymux-timestamp'
export const NONCE_HEADER = 'x-polymux-nonce'
export const REPLAY_WINDOW_SECONDS = 300

export interface SignedRequestHeaders {
  [SIGNATURE_HEADER]: string
  [TIMESTAMP_HEADER]: string
  [NONCE_HEADER]: string
}

/** 32-byte URL-safe base64 secret. Generated at publish time, stored encrypted. */
export function generateSigningSecret(): string {
  return randomBytes(32).toString('base64url')
}

function computeSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/**
 * Sign an outbound webhook request. Caller should add the returned headers
 * to its fetch call and POST the same `body`. Timestamp is seconds since
 * epoch; nonce is a per-call random string the integration MAY use to
 * dedupe (we don't enforce uniqueness on the integration side — it's
 * informational).
 */
export function signRequest(secret: string, body: string): { headers: SignedRequestHeaders, body: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('base64url')
  const sig = computeSignature(secret, timestamp, body)
  return {
    headers: {
      [SIGNATURE_HEADER]: `v1=${sig}`,
      [TIMESTAMP_HEADER]: timestamp,
      [NONCE_HEADER]: nonce,
    },
    body,
  }
}

export interface VerifyResult {
  ok: boolean
  reason?: 'missing_headers' | 'bad_format' | 'expired' | 'mismatch'
}

/**
 * Verify an inbound request's signature. The integration's response
 * webhook (when async events flow back) is signed with the same secret;
 * Polymux uses this on the receiving side.
 */
export function verifyRequest(
  secret: string,
  body: string,
  headers: { signature?: string | null, timestamp?: string | null },
): VerifyResult {
  const sigHeader = headers.signature
  const tsHeader = headers.timestamp
  if (!sigHeader || !tsHeader) {
    return { ok: false, reason: 'missing_headers' }
  }
  const m = sigHeader.match(/^v1=([0-9a-f]{64})$/i)
  if (!m) {
    return { ok: false, reason: 'bad_format' }
  }
  const provided = Buffer.from(m[1]!, 'hex')

  const tsNum = Number.parseInt(tsHeader, 10)
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'bad_format' }
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum)
  if (skew > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: 'expired' }
  }

  const expected = Buffer.from(computeSignature(secret, tsHeader, body), 'hex')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true }
}
