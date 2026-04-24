import { useAppToast } from '~/composables/useAppToast'

export type ItemCategory = 'workflow' | 'plugin' | 'connection'

export interface MarketplaceItem {
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
  popularity: number
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

const CATALOG: MarketplaceItem[] = [
  // Integrations
  { id: 'google-drive', name: 'Google Drive', description: 'Access and manage files in your Google Drive directly from Polymux.', category: 'connection', author: 'Google', popularity: 98 },
  { id: 'gmail', name: 'Gmail', description: 'Search, read, and send emails from your Gmail account.', category: 'connection', author: 'Google', popularity: 95 },
  { id: 'github', name: 'GitHub', description: 'Browse repositories, create issues, and review pull requests.', category: 'connection', author: 'GitHub', popularity: 92 },
  { id: 'slack', name: 'Slack', description: 'Send messages and read channel history from your Slack workspace.', category: 'connection', author: 'Slack', popularity: 88 },
  { id: 'notion', name: 'Notion', description: 'Read and write Notion pages, databases, and blocks.', category: 'connection', author: 'Notion', popularity: 80 },
  { id: 'linear', name: 'Linear', description: 'Manage issues, projects, and sprints in Linear.', category: 'connection', author: 'Linear', popularity: 72 },
  // Workflows
  { id: 'email-summarizer', name: 'Email Summarizer', description: 'Automatically summarizes your inbox into concise daily digests.', category: 'workflow', author: 'Polymux', popularity: 85 },
  { id: 'daily-briefing', name: 'Daily Briefing', description: 'Compiles a morning briefing from calendars, emails, and your connected sources.', category: 'workflow', author: 'Polymux', popularity: 78 },
  { id: 'research-assistant', name: 'Research Assistant', description: 'Automates deep-dive research and produces structured, citable reports.', category: 'workflow', author: 'Polymux', popularity: 70 },
  { id: 'code-reviewer', name: 'Code Reviewer', description: 'Reviews pull requests and surfaces issues, suggestions, and risks automatically.', category: 'workflow', author: 'Polymux', popularity: 68 },
  // Plugins (bundles)
  { id: 'google-workspace', name: 'Google Workspace', description: 'Full suite: Drive, Gmail, Calendar, and Docs all bundled and pre-wired together.', category: 'plugin', author: 'Polymux', popularity: 90 },
  { id: 'dev-toolkit', name: 'Dev Toolkit', description: 'GitHub, Linear, and Slack bundled and pre-configured for engineering teams.', category: 'plugin', author: 'Polymux', popularity: 75 },
  { id: 'productivity-pack', name: 'Productivity Pack', description: 'Notion, Gmail, and Calendar combined with smart scheduling workflows.', category: 'plugin', author: 'Polymux', popularity: 65 },
]

export function useMarketplace() {
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  const { data: connections, refresh } = useAsyncData<WorkspaceIntegration[]>(
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

  const installedItems = computed(() =>
    CATALOG.filter(item => isInstalled(item.id)),
  )

  async function install(id: string) {
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) return
    if (!isAdmin.value) {
      toast.show('Only workspace owners and admins can manage integrations.', 'error')
      return
    }
    const item = CATALOG.find(i => i.id === id)
    if (!item) return

    if (item.category === 'connection') {
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
      await refresh()
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
      await refresh()
    }
    catch (err) {
      console.error('[useMarketplace] uninstall failed', err)
      const message = (err as { statusMessage?: string })?.statusMessage
        || 'Failed to disconnect integration.'
      toast.show(message, 'error')
    }
  }

  return {
    catalog: CATALOG,
    connections,
    isAdmin,
    isInstalled,
    connectionFor,
    install,
    uninstall,
    installedItems,
    refresh,
  }
}
