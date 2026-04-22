import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

const PLAN_STORAGE_BYTES: Record<string, number | null> = {
  free: 100 * 1024 * 1024,
  pro: 5 * 1024 * 1024 * 1024,
  max: 50 * 1024 * 1024 * 1024,
  enterprise: null,
}

const BUCKET = 'workspace-files'

export interface ProviderUsageCard {
  provider: StorageProvider
  label: string
  state: 'tracked' | 'unlimited' | 'connected-untracked' | 'unsupported' | 'disconnected'
  used: number | null
  total: number | null
  percent: number | null
  loading: boolean
}

interface LocalProbeState {
  supported: boolean
  usage: number
  quota: number
}

async function computeBucketBytes(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  let total = 0
  const queue: string[] = [`${workspaceId}/main`, `${workspaceId}/shared`]
  const MAX_FOLDERS = 500
  let visited = 0
  while (queue.length > 0 && visited < MAX_FOLDERS) {
    const prefix = queue.shift()!
    visited += 1
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
    if (error || !data) continue
    for (const item of data) {
      if (item.name === '.keep') continue
      if (item.id === null) {
        queue.push(`${prefix}/${item.name}`)
      }
      else {
        const size = (item.metadata as { size?: number } | null | undefined)?.size
        if (typeof size === 'number') total += size
      }
    }
  }
  return total
}

export function useStorageUsage() {
  const supabase = useSupabaseClient()
  const { currentWorkspaceId, currentWorkspace } = useWorkspaces()
  const { isInstalled } = useMarketplace()
  const { probe: probeLocal } = useLocalFileStorage()
  const { providerStatus } = useStoragePreferences()
  const { t } = useI18n()

  // Shared session-level state so probes don't repeat across pages/components
  const cloudBytes = useState<number>('storage-usage-cloud-bytes', () => 0)
  const cloudLoaded = useState<boolean>('storage-usage-cloud-loaded', () => false)
  const cloudLoading = useState<boolean>('storage-usage-cloud-loading', () => false)
  const localProbe = useState<LocalProbeState>(
    'storage-usage-local-probe',
    () => ({ supported: false, usage: 0, quota: 0 }),
  )
  const localLoaded = useState<boolean>('storage-usage-local-loaded', () => false)
  const localLoading = useState<boolean>('storage-usage-local-loading', () => false)

  async function refreshCloud(force = false) {
    if (!force && (cloudLoaded.value || cloudLoading.value)) return
    if (!currentWorkspaceId.value) return
    cloudLoading.value = true
    try {
      cloudBytes.value = await computeBucketBytes(supabase, currentWorkspaceId.value)
      cloudLoaded.value = true
    }
    catch {
      cloudBytes.value = 0
    }
    finally {
      cloudLoading.value = false
    }
  }

  async function refreshLocal(force = false) {
    if (!force && (localLoaded.value || localLoading.value)) return
    if (!import.meta.client) return
    localLoading.value = true
    try {
      const p = await probeLocal()
      localProbe.value = { supported: p.supported, usage: p.usage, quota: p.quota }
      localLoaded.value = true
    }
    finally {
      localLoading.value = false
    }
  }

  async function refresh(force = false) {
    await Promise.all([refreshCloud(force), refreshLocal(force)])
  }

  const planStorageBytes = computed<number | null>(() => {
    const plan = (currentWorkspace.value?.plan ?? 'free').toLowerCase()
    if (plan in PLAN_STORAGE_BYTES) return PLAN_STORAGE_BYTES[plan]!
    return PLAN_STORAGE_BYTES.free!
  })

  const driveConnected = computed(() => isInstalled('google-drive'))

  const cards = computed<ProviderUsageCard[]>(() => {
    const out: ProviderUsageCard[] = []

    if (providerStatus.value['supabase'] === 'available') {
      const total = planStorageBytes.value
      const used = cloudBytes.value
      const percent = total != null && total > 0
        ? Math.min(100, (used / total) * 100)
        : null
      out.push({
        provider: 'supabase',
        label: t('storage.settings.providerCloud'),
        state: total == null ? 'unlimited' : 'tracked',
        used,
        total,
        percent,
        loading: cloudLoading.value,
      })
    }

    if (driveConnected.value) {
      out.push({
        provider: 'google-drive',
        label: t('storage.settings.providerGoogleDrive'),
        state: 'connected-untracked',
        used: null,
        total: null,
        percent: null,
        loading: false,
      })
    }

    const localStatus = providerStatus.value['local']
    if (localStatus === 'available' || localStatus === 'full') {
      const lp = localProbe.value
      const tracked = lp.supported && lp.quota > 0
      const percent = tracked ? Math.min(100, (lp.usage / lp.quota) * 100) : null
      out.push({
        provider: 'local',
        label: t('storage.settings.providerLocal'),
        state: tracked ? 'tracked' : 'connected-untracked',
        used: lp.supported ? lp.usage : null,
        total: lp.supported ? lp.quota : null,
        percent,
        loading: localLoading.value,
      })
    }

    return out
  })

  return {
    cards,
    refresh,
    refreshCloud,
    refreshLocal,
  }
}

export function formatBytesShort(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}
