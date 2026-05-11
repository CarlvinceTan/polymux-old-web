import type { ItemCategory } from '~/composables/integrations/useMarketplace'

export interface IntegrationIconMeta {
  iconName: string
  tintClass: string
}

const NEUTRAL_TINT = 'bg-neutral-100 text-neutral-700'

const PROVIDER_ICONS: Record<string, IntegrationIconMeta> = {
  'google-drive': {
    iconName: 'i-simple-icons-googledrive',
    tintClass: 'bg-google-drive-tint text-google-drive',
  },
  'gmail': {
    iconName: 'i-simple-icons-gmail',
    tintClass: NEUTRAL_TINT,
  },
  'github': {
    iconName: 'i-simple-icons-github',
    tintClass: NEUTRAL_TINT,
  },
  'slack': {
    iconName: 'i-simple-icons-slack',
    tintClass: NEUTRAL_TINT,
  },
  'notion': {
    iconName: 'i-simple-icons-notion',
    tintClass: NEUTRAL_TINT,
  },
  'linear': {
    iconName: 'i-simple-icons-linear',
    tintClass: NEUTRAL_TINT,
  },
}

const CATEGORY_FALLBACK: Record<ItemCategory, IntegrationIconMeta> = {
  workflow: {
    iconName: 'i-heroicons-bolt-20-solid',
    tintClass: NEUTRAL_TINT,
  },
  plugin: {
    iconName: 'i-heroicons-cube-transparent-20-solid',
    tintClass: NEUTRAL_TINT,
  },
  integration: {
    iconName: 'i-heroicons-link-20-solid',
    tintClass: NEUTRAL_TINT,
  },
}

export function integrationIconMeta(id: string, category: ItemCategory): IntegrationIconMeta {
  return PROVIDER_ICONS[id] ?? CATEGORY_FALLBACK[category]
}
