import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const here = dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: {
    '~': join(here, '../..'),
  },
})

const { extractCredentialHost, passwordMatchesSite } = jiti('./credentialSiteMatch.ts')

function entry(partial) {
  return {
    lastUsed: '2026-01-01',
    usageCount: 0,
    weak: false,
    hasTotp: false,
    createdBy: 'u1',
    lastUsedBy: null,
    createdAt: '2026-01-01',
    ...partial,
  }
}

describe('credentialSiteMatch', () => {
  it('matches by hostname', () => {
    const row = entry({
      id: '1',
      name: 'Sunmi',
      url: 'https://partner.sunmi.com/login',
      username: 'a@b.com',
    })
    assert.equal(passwordMatchesSite(row, 'https://partner.sunmi.com'), true)
  })

  it('matches display-name site labels', () => {
    const row = entry({
      id: '1',
      name: 'Sunmi Partner',
      url: 'https://partner.sunmi.com',
      username: 'a@b.com',
    })
    assert.equal(passwordMatchesSite(row, 'Sunmi Partner Platform'), true)
  })

  it('extracts host only for domain-like input', () => {
    assert.equal(extractCredentialHost('Sunmi Partner Platform'), '')
    assert.equal(extractCredentialHost('partner.sunmi.com'), 'partner.sunmi.com')
  })
})
