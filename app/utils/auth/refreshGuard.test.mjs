import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const here = dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '~': join(here, '../..') } })
const { createRefreshGuard, isRefreshRequest } = jiti('./refreshGuard.ts')

const REFRESH_URL = 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token'
const PASSWORD_URL = 'https://proj.supabase.co/auth/v1/token?grant_type=password'
const USER_URL = 'https://proj.supabase.co/auth/v1/user'

/** Build a guard with an injected clock, immediate (recorded) delay, and spies. */
function harness(opts = {}) {
  let clock = 0
  const calls = { real: 0, purge: 0, trips: 0, delays: [] }
  const guard = createRefreshGuard({
    fetch: async () => { calls.real++; return new Response('{}', { status: 200 }) },
    purge: () => { calls.purge++ },
    onTrip: () => { calls.trips++ },
    now: () => clock,
    delay: async (ms) => { calls.delays.push(ms) },
  }, opts)
  return {
    calls,
    advance: ms => { clock += ms },
    fetch: url => guard(url),
  }
}

test('isRefreshRequest matches only refresh-token grants', () => {
  assert.equal(isRefreshRequest(REFRESH_URL), true)
  assert.equal(isRefreshRequest(PASSWORD_URL), false)
  assert.equal(isRefreshRequest(USER_URL), false)
})

test('passes non-refresh requests straight through, never trips', async () => {
  const h = harness()
  for (let i = 0; i < 50; i++) await h.fetch(USER_URL)
  for (let i = 0; i < 50; i++) await h.fetch(PASSWORD_URL)
  assert.equal(h.calls.real, 100)
  assert.equal(h.calls.purge, 0)
  assert.equal(h.calls.trips, 0)
})

test('allows refreshes up to the threshold', async () => {
  const h = harness({ maxInWindow: 6, windowMs: 10_000 })
  for (let i = 0; i < 6; i++) { await h.fetch(REFRESH_URL); h.advance(100) }
  assert.equal(h.calls.real, 6)
  assert.equal(h.calls.purge, 0)
  assert.equal(h.calls.trips, 0)
})

test('trips on a burst: caps server hits, paces, purges exactly once', async () => {
  const h = harness({ maxInWindow: 6, windowMs: 10_000, throttleMs: 3000 })
  const results = []
  for (let i = 0; i < 200; i++) results.push(await h.fetch(REFRESH_URL)) // all at t=0

  assert.equal(h.calls.real, 6, 'only threshold-many refreshes reach the server')
  assert.equal(h.calls.trips, 1, 'trips once for the burst')
  assert.equal(h.calls.purge, 1, 'purges the stale session exactly once')
  assert.equal(h.calls.delays.length, 194, 'every tripped call is paced')
  assert.ok(h.calls.delays.every(d => d === 3000), 'paced by throttleMs')
  assert.equal(results[100].status, 429, 'tripped calls return a synthetic failure')
})

test('recovers after the window: lets a real refresh through again', async () => {
  const h = harness({ maxInWindow: 3, windowMs: 1000, throttleMs: 100 })
  for (let i = 0; i < 3; i++) await h.fetch(REFRESH_URL) // 3 real (t=0)
  await h.fetch(REFRESH_URL) // trips
  assert.equal(h.calls.real, 3)
  assert.equal(h.calls.purge, 1)

  h.advance(2000) // past window + cooldown
  await h.fetch(REFRESH_URL)
  assert.equal(h.calls.real, 4, 'a fresh refresh is allowed once the storm subsides')
})

test('purges again on a second, distinct burst', async () => {
  const h = harness({ maxInWindow: 2, windowMs: 1000, throttleMs: 10 })
  await h.fetch(REFRESH_URL); await h.fetch(REFRESH_URL)
  await h.fetch(REFRESH_URL) // trip #1
  assert.equal(h.calls.purge, 1)

  h.advance(2000)
  await h.fetch(REFRESH_URL); await h.fetch(REFRESH_URL)
  await h.fetch(REFRESH_URL) // trip #2
  assert.equal(h.calls.purge, 2)
  assert.equal(h.calls.trips, 2)
})
