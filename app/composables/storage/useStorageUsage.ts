import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from '~/types/storage'

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
  // Drive quota reflects the whole Google account (Drive + Gmail + Photos).
  // `limit` is null when the account has no quota cap — renders as ∞.
  const driveQuota = useState<{ usage: number, limit: number | null } | null>(
    'storage-usage-drive-quota',
    () => null,
  )
  const driveLoaded = useState<boolean>('storage-usage-drive-loaded', () => false)
  const driveLoading = useState<boolean>('storage-usage-drive-loading', () => false)

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

  async function refreshDrive(force = false) {
    if (!force && (driveLoaded.value || driveLoading.value)) return
    if (!currentWorkspaceId.value) return
    if (!isInstalled('google-drive')) return
    driveLoading.value = true
    try {
      const res = await $fetch<{ usage: number, limit: number | null }>(
        `/api/workspaces/${currentWorkspaceId.value}/integrations/google-drive/usage`,
      )
      driveQuota.value = { usage: res.usage, limit: res.limit }
      driveLoaded.value = true
    }
    catch (err) {
      console.warn('[useStorageUsage] drive quota fetch failed', err)
      driveQuota.value = null
    }
    finally {
      driveLoading.value = false
    }
  }

  async function refresh(force = false) {
    await Promise.all([refreshCloud(force), refreshLocal(force), refreshDrive(force)])
  }

  const planStorageBytes = computed<number | null>(() => {
    const plan = (currentWorkspace.value?.plan ?? 'free').toLowerCase()
    if (plan in PLAN_STORAGE_BYTES) return PLAN_STORAGE_BYTES[plan]!
    return PLAN_STORAGE_BYTES.free!
  })

  const driveConnected = computed(() => isInstalled('google-drive'))

  // useMarketplace's `connections` hydrates via useAsyncData, so isInstalled()
  // may be false when useStorageUsage first mounts and only flip to true once
  // the workspace-integrations fetch resolves. Without this watch, the drive
  // probe's initial `isInstalled` guard bails and we never retry — tooltip
  // stays on "—" forever.
  watch(driveConnected, (installed) => {
    if (installed) refreshDrive().catch(() => {})
  }, { immediate: true })

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
      const q = driveQuota.value
      // If the probe hasn't succeeded (still loading or last call errored),
      // fall back to connected-untracked so the UI shows "—" rather than a
      // misleading 0%.
      if (q == null) {
        out.push({
          provider: 'google-drive',
          label: t('storage.settings.providerGoogleDrive'),
          state: 'connected-untracked',
          used: null,
          total: null,
          percent: null,
          loading: driveLoading.value,
        })
      }
      else if (q.limit == null) {
        out.push({
          provider: 'google-drive',
          label: t('storage.settings.providerGoogleDrive'),
          state: 'unlimited',
          used: q.usage,
          total: null,
          percent: null,
          loading: driveLoading.value,
        })
      }
      else {
        const percent = q.limit > 0 ? Math.min(100, (q.usage / q.limit) * 100) : null
        out.push({
          provider: 'google-drive',
          label: t('storage.settings.providerGoogleDrive'),
          state: 'tracked',
          used: q.usage,
          total: q.limit,
          percent,
          loading: driveLoading.value,
        })
      }
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
    refreshDrive,
  }
}

export function formatBytesShort(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}
