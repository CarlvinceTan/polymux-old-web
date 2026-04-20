export type ItemCategory = 'workflow' | 'plugin' | 'connection'

export interface MarketplaceItem {
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
}

const CATALOG: MarketplaceItem[] = [
  // Integrations
  { id: 'google-drive', name: 'Google Drive', description: 'Access and manage files in your Google Drive directly from Polymux.', category: 'connection', author: 'Google' },
  { id: 'gmail', name: 'Gmail', description: 'Search, read, and send emails from your Gmail account.', category: 'connection', author: 'Google' },
  { id: 'github', name: 'GitHub', description: 'Browse repositories, create issues, and review pull requests.', category: 'connection', author: 'GitHub' },
  { id: 'slack', name: 'Slack', description: 'Send messages and read channel history from your Slack workspace.', category: 'connection', author: 'Slack' },
  { id: 'notion', name: 'Notion', description: 'Read and write Notion pages, databases, and blocks.', category: 'connection', author: 'Notion' },
  { id: 'linear', name: 'Linear', description: 'Manage issues, projects, and sprints in Linear.', category: 'connection', author: 'Linear' },
  // Workflows
  { id: 'email-summarizer', name: 'Email Summarizer', description: 'Automatically summarizes your inbox into concise daily digests.', category: 'workflow', author: 'Polymux' },
  { id: 'daily-briefing', name: 'Daily Briefing', description: 'Compiles a morning briefing from calendars, emails, and your connected sources.', category: 'workflow', author: 'Polymux' },
  { id: 'research-assistant', name: 'Research Assistant', description: 'Automates deep-dive research and produces structured, citable reports.', category: 'workflow', author: 'Polymux' },
  { id: 'code-reviewer', name: 'Code Reviewer', description: 'Reviews pull requests and surfaces issues, suggestions, and risks automatically.', category: 'workflow', author: 'Polymux' },
  // Plugins (bundles)
  { id: 'google-workspace', name: 'Google Workspace', description: 'Full suite: Drive, Gmail, Calendar, and Docs all bundled and pre-wired together.', category: 'plugin', author: 'Polymux' },
  { id: 'dev-toolkit', name: 'Dev Toolkit', description: 'GitHub, Linear, and Slack bundled and pre-configured for engineering teams.', category: 'plugin', author: 'Polymux' },
  { id: 'productivity-pack', name: 'Productivity Pack', description: 'Notion, Gmail, and Calendar combined with smart scheduling workflows.', category: 'plugin', author: 'Polymux' },
]

export function useMarketplace() {
  const installedIds = useState<string[]>('marketplace-installed', () => [])

  function isInstalled(id: string) {
    return installedIds.value.includes(id)
  }

  function install(id: string) {
    if (!installedIds.value.includes(id)) {
      installedIds.value = [...installedIds.value, id]
    }
  }

  function uninstall(id: string) {
    installedIds.value = installedIds.value.filter(i => i !== id)
  }

  const installedItems = computed(() =>
    CATALOG.filter(item => installedIds.value.includes(item.id)),
  )

  return { catalog: CATALOG, isInstalled, install, uninstall, installedItems }
}
