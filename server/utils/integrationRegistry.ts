// Server-side registry of known marketplace provider ids and their category.
//
// Frontend (`useMarketplace.ts`) carries the full display catalog (names,
// descriptions, authors) — kept separate intentionally so server routes don't
// have to stay in sync with copy. The server only needs to know:
//   1. Which provider ids are valid.
//   2. Which ones are OAuth connections (must go through /api/integrations/
//      [provider]/connect redirects, not direct POST) vs. plugins/workflows
//      that can be installed inline.

export type IntegrationCategory = 'connection' | 'plugin' | 'workflow'

export const INTEGRATION_REGISTRY: Record<string, IntegrationCategory> = {
  // OAuth connections
  'google-drive': 'connection',
  'gmail': 'connection',
  'github': 'connection',
  'slack': 'connection',
  'notion': 'connection',
  'linear': 'connection',

  // Polymux-native workflow presets (no OAuth; install inline)
  'email-summarizer': 'workflow',
  'daily-briefing': 'workflow',
  'research-assistant': 'workflow',
  'code-reviewer': 'workflow',

  // Plugin bundles (no OAuth at the bundle level; installing the bundle
  // prompts to connect each child connection separately — child connections
  // still go through the OAuth path)
  'google-workspace': 'plugin',
  'dev-toolkit': 'plugin',
  'productivity-pack': 'plugin',
}

export function isKnownProvider(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTEGRATION_REGISTRY, id)
}

export function providerCategory(id: string): IntegrationCategory | null {
  return INTEGRATION_REGISTRY[id] ?? null
}

export function isOAuthProvider(id: string): boolean {
  return INTEGRATION_REGISTRY[id] === 'connection'
}
