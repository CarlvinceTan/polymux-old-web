import { describe, expect, it } from 'vitest'
import type { PasswordEntry } from '~/composables/vault/usePasswords'
import { extractCredentialHost, passwordMatchesSite } from '~/composables/vault/credentialSiteMatch'

function entry(partial: Partial<PasswordEntry> & Pick<PasswordEntry, 'id' | 'name' | 'url' | 'username'>): PasswordEntry {
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
    expect(passwordMatchesSite(row, 'https://partner.sunmi.com')).toBe(true)
  })

  it('matches display-name site labels', () => {
    const row = entry({
      id: '1',
      name: 'Sunmi Partner',
      url: 'https://partner.sunmi.com',
      username: 'a@b.com',
    })
    expect(passwordMatchesSite(row, 'Sunmi Partner Platform')).toBe(true)
  })

  it('extracts host only for domain-like input', () => {
    expect(extractCredentialHost('Sunmi Partner Platform')).toBe('')
    expect(extractCredentialHost('partner.sunmi.com')).toBe('partner.sunmi.com')
  })
})
