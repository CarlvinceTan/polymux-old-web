import type { StorageProvider } from '~/types/storage'

export type ProviderStatus = 'available' | 'unavailable' | 'full' | 'locked'

const STORAGE_KEY = 'polymux_storage_save_order'
// Drive ahead of Cloud by default — user-owned bytes win when both are
// available. Local trails because it doesn't share with teammates.
const DEFAULT_ORDER: StorageProvider[] = ['google-drive', 'b2', 'local']

// Plans that include a Cloud quota (PLAN_CLOUD_BYTES > 0). Mirrors
// web/server/utils/billing/planLimits.ts; keep in sync.
const PLANS_WITH_CLOUD = new Set(['pro', 'max', 'enterprise'])

export function planHasCloud(plan: string | undefined | null): boolean {
  if (!plan) return false
  return PLANS_WITH_CLOUD.has(plan.toLowerCase().trim())
}

function readPersisted(): StorageProvider[] {
  if (import.meta.server) return [...DEFAULT_ORDER]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER]
    const filtered = parsed.filter((v): v is StorageProvider =>
      v === 'google-drive' || v === 'local' || v === 'b2',
    )
    for (const p of DEFAULT_ORDER) {
      if (!filtered.includes(p)) filtered.push(p)
    }
    return filtered
  }
  catch {
    return [...DEFAULT_ORDER]
  }
}

let hydrated = false
let healthProbed = false

export function useStoragePreferences() {
  const { isInstalled } = useMarketplace()
  const { currentWorkspace } = useWorkspaces()

  const saveOrder = useState<StorageProvider[]>('storage-save-order', () => readPersisted())
  const localHealth = useState<ProviderStatus>('storage-local-health', () => 'unavailable')

  if (import.meta.client && !hydrated) {
    hydrated = true
    const persisted = readPersisted()
    if (JSON.stringify(persisted) !== JSON.stringify(saveOrder.value)) {
      saveOrder.value = persisted
    }
  }

  if (import.meta.client && !healthProbed) {
    healthProbed = true
    const { probe } = useLocalFileStorage()
    probe()
      .then((p) => {
        if (!p.supported) localHealth.value = 'unavailable'
        else if (p.full) localHealth.value = 'full'
        else localHealth.value = 'available'
      })
      .catch(() => { localHealth.value = 'unavailable' })
  }

  function persist(next: StorageProvider[]) {
    saveOrder.value = next
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  }

  function swap(a: StorageProvider, b: StorageProvider) {
    if (a === b) return
    const next = [...saveOrder.value]
    const ia = next.indexOf(a)
    const ib = next.indexOf(b)
    if (ia === -1 || ib === -1) return
    next[ia] = b
    next[ib] = a
    persist(next)
  }

  function reset() { persist([...DEFAULT_ORDER]) }

  const providerStatus = computed<Record<StorageProvider, ProviderStatus>>(() => ({
    'google-drive': isInstalled('google-drive') ? 'available' : 'unavailable',
    'local': localHealth.value,
    // Cloud (B2) is plan-gated. Free plans get `locked` so the UI can show
    // an upgrade affordance instead of a generic "unavailable" — the
    // distinction matters because Drive/Local "unavailable" usually means
    // "not connected yet" whereas Cloud "locked" means "buy a higher plan".
    'b2': planHasCloud(currentWorkspace.value?.plan) ? 'available' : 'locked',
  }))

  /** Preferred order filtered to providers that can currently accept writes. */
  const resolvedOrder = computed<StorageProvider[]>(() =>
    saveOrder.value.filter(p => providerStatus.value[p] === 'available'),
  )

  function moveUp(provider: StorageProvider) {
    const idx = resolvedOrder.value.indexOf(provider)
    if (idx <= 0) return
    const prev = resolvedOrder.value[idx - 1]
    if (prev) swap(provider, prev)
  }

  function moveDown(provider: StorageProvider) {
    const idx = resolvedOrder.value.indexOf(provider)
    if (idx === -1 || idx >= resolvedOrder.value.length - 1) return
    const next = resolvedOrder.value[idx + 1]
    if (next) swap(provider, next)
  }

  return {
    saveOrder: readonly(saveOrder),
    providerStatus,
    resolvedOrder,
    moveUp,
    moveDown,
    reset,
  }
}
