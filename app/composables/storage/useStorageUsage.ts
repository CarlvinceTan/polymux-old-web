import type { StorageProvider } from '~/types/storage'

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

export function useStorageUsage() {
  const { currentWorkspaceId } = useWorkspaces()
  const { isInstalled } = useMarketplace()
  const { probe: probeLocal } = useLocalFileStorage()
  const { providerStatus } = useStoragePreferences()
  const { t } = useI18n()

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
    await Promise.all([refreshLocal(force), refreshDrive(force)])
  }

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
