import type { PasswordEntry } from '~/composables/vault/usePasswords'

/** Hostname from a URL or bare domain; empty when input is a display name only. */
export function extractCredentialHost(input: string): string {
  if (!input) return ''
  try {
    const href = input.startsWith('http') ? input : `https://${input}`
    const host = new URL(href).hostname.replace(/^www\./, '')
    // Reject free-text labels that are not domain-like.
    if (!host.includes('.')) return ''
    return host
  }
  catch {
    const stripped = input.replace(/\/.*$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '')
    return stripped.includes('.') ? stripped : ''
  }
}

function siteTokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3)
}

/** True when a vault row plausibly belongs to the site the agent requested. */
export function passwordMatchesSite(entry: PasswordEntry, site: string): boolean {
  const requestHost = extractCredentialHost(site)
  const entryHosts = [extractCredentialHost(entry.url), extractCredentialHost(entry.name)].filter(Boolean)

  if (requestHost) {
    for (const host of entryHosts) {
      if (host === requestHost) return true
      if (host.endsWith(`.${requestHost}`) || requestHost.endsWith(`.${host}`)) return true
    }
  }

  const entryText = `${entry.name} ${entry.url}`.toLowerCase()
  for (const token of siteTokens(site)) {
    if (entryText.includes(token)) return true
  }
  return false
}
