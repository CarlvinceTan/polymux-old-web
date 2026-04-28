import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

export type ProviderStatus = 'available' | 'unavailable' | 'full'

const STORAGE_KEY = 'polymux_storage_save_order'
const DEFAULT_ORDER: StorageProvider[] = ['supabase', 'google-drive', 'local']

function readPersisted(): StorageProvider[] {
  if (import.meta.server) return [...DEFAULT_ORDER]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER]
    const filtered = parsed.filter((v): v is StorageProvider =>
      v === 'supabase' || v === 'google-drive' || v === 'local',
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
  const user = useSupabaseUser()
  const { isInstalled } = useMarketplace()

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
    'supabase': user.value ? 'available' : 'unavailable',
    'google-drive': isInstalled('google-drive') ? 'available' : 'unavailable',
    'local': localHealth.value,
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
