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

export function useStoragePreferences() {
  const user = useSupabaseUser()
  const { isInstalled } = useMarketplace()

  const saveOrder = useState<StorageProvider[]>('storage-save-order', () => readPersisted())

  if (import.meta.client && !hydrated) {
    hydrated = true
    const persisted = readPersisted()
    if (JSON.stringify(persisted) !== JSON.stringify(saveOrder.value)) {
      saveOrder.value = persisted
    }
  }

  function persist(next: StorageProvider[]) {
    saveOrder.value = next
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= saveOrder.value.length || from === to) return
    const next = [...saveOrder.value]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    persist(next)
  }

  function moveUp(index: number) { move(index, index - 1) }
  function moveDown(index: number) { move(index, index + 1) }

  function reset() { persist([...DEFAULT_ORDER]) }

  const providerStatus = computed<Record<StorageProvider, ProviderStatus>>(() => ({
    'supabase': user.value ? 'available' : 'unavailable',
    'google-drive': isInstalled('google-drive') ? 'available' : 'unavailable',
    'local': 'available',
  }))

  /** Preferred order filtered to providers that can currently accept writes. */
  const resolvedOrder = computed<StorageProvider[]>(() =>
    saveOrder.value.filter(p => providerStatus.value[p] === 'available'),
  )

  return {
    saveOrder: readonly(saveOrder),
    providerStatus,
    resolvedOrder,
    moveUp,
    moveDown,
    reset,
  }
}
