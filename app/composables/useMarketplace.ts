import { useAppToast } from '~/composables/useAppToast'

// User-facing taxonomy: integrations are code-based (first-party connectors
// or third-party manifest+webhook), workflows are JSON definitions, plugins
// bundle integrations + workflows. The marketplace catalog mixes all three.
export type ItemCategory = 'integration' | 'workflow' | 'plugin'

export interface MarketplaceItem {
  /** Stable client-side id; matches `workspace_integrations.provider` and `integrations.slug`. */
  id: string
  /** Database PK (uuid). Use when an endpoint needs the real `integrations.id` (plugin bundle children). */
  dbId: string
  slug: string
  name: string
  description: string
  category: ItemCategory
  author: string
  popularity: number
  tags: string[]
  /** Hint to the install flow: route through OAuth redirect instead of POST install. */
  requiresOauth: boolean
  isFirstParty: boolean
  isVerified: boolean
  homepageUrl?: string | null
  githubUrl?: string | null
  iconUrl?: string | null
  currentVersion?: string | null
}

export interface WorkspaceIntegration {
  id: string
  workspace_id: string
  provider: string
  connected_by: string
  account_email: string | null
  account_display_name: string | null
  scopes: string[]
  expires_at: string | null
  root_folder_id: string | null
  root_folder_name: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export function useMarketplace() {
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  const { data: catalog, refresh: refreshCatalog } = useAsyncData<MarketplaceItem[]>(
    'marketplace-catalog',
    async () => await $fetch<MarketplaceItem[]>('/api/marketplace/integrations'),
    { default: () => [] },
  )

  const { data: connections, refresh: refreshConnections } = useAsyncData<WorkspaceIntegration[]>(
    'workspace-integrations',
    async () => {
      const id = currentWorkspace.value?.id
      if (!id) return []
      return await $fetch<WorkspaceIntegration[]>(
        `/api/workspaces/${id}/integrations`,
      )
    },
    {
      watch: [() => currentWorkspace.value?.id],
      default: () => [],
    },
  )

  // Refresh both lists when the server comes back online — without this, an
  // initial fetch that failed during downtime never retries, leaving the
  // marketplace and `isInstalled` checks blank.
  useOnReconnect(async () => {
    await Promise.all([refreshCatalog(), refreshConnections()])
  })

  const isAdmin = computed(() => {
    const role = currentWorkspace.value?.role
    return role === 'owner' || role === 'admin'
  })

  function isInstalled(id: string): boolean {
    return (connections.value ?? []).some(c => c.provider === id)
  }

  function connectionFor(id: string): WorkspaceIntegration | null {
    return (connections.value ?? []).find(c => c.provider === id) ?? null
  }

  // Installed = catalog rows whose slug appears in the workspace's connections.
  // Driven by the catalog, not the connections list, so each card carries the
  // marketplace metadata (description, author, tags, icon) for the Installed
  // page. Stale connections without a matching catalog row would only happen
  // if someone deletes a first-party seed row; not worth a fallback path.
  const installedItems = computed(() =>
    (catalog.value ?? []).filter(item => isInstalled(item.id)),
  )

  async function install(id: string) {
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) return
    if (!isAdmin.value) {
      toast.show('Only workspace owners and admins can manage integrations.', 'error')
      return
    }
    const item = (catalog.value ?? []).find(i => i.id === id)
    if (!item) return

    // First-party OAuth connectors and any catalog item flagged as needing
    // OAuth go through the redirect flow. Third-party tool/workflow/plugin
    // installs (Phase 2+) hit the inline POST instead.
    if (item.requiresOauth) {
      if (import.meta.client) {
        window.location.href = `/api/integrations/${id}/connect?workspace_id=${workspaceId}`
      }
      return
    }

    try {
      await $fetch(`/api/workspaces/${workspaceId}/integrations`, {
        method: 'POST',
        body: { provider: id },
      })
      await Promise.all([refreshConnections(), refreshCatalog()])
    }
    catch (err) {
      console.error('[useMarketplace] install failed', err)
      const message = (err as { statusMessage?: string })?.statusMessage
        || 'Failed to install integration.'
      toast.show(message, 'error')
    }
  }

  async function uninstall(id: string) {
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) return
    if (!isAdmin.value) {
      toast.show('Only workspace owners and admins can manage integrations.', 'error')
      return
    }
    try {
      await $fetch(`/api/workspaces/${workspaceId}/integrations/${id}`, {
        method: 'DELETE',
      })
      await Promise.all([refreshConnections(), refreshCatalog()])
    }
    catch (err) {
      console.error('[useMarketplace] uninstall failed', err)
      const message = (err as { statusMessage?: string })?.statusMessage
        || 'Failed to disconnect integration.'
      toast.show(message, 'error')
    }
  }

  return {
    catalog,
    connections,
    isAdmin,
    isInstalled,
    connectionFor,
    install,
    uninstall,
    installedItems,
    refresh: refreshConnections,
    refreshCatalog,
  }
}
