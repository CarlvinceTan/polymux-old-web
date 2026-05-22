import { KNOWN_TARGET_SECTIONS, type LayoutTargetSection } from '~~/server/utils/integrations/layoutSections'
import { useMarketplace } from '~/composables/integrations/useMarketplace'
import { useAppToast } from '~/composables/ui/useAppToast'
// `useWorkspaces` is auto-imported by Nuxt; no explicit import needed.

// Derives the installed kind='layout' tabs for a section from the
// workspace_integrations list (already fetched by useMarketplace). Each
// row's metadata carries { kind, target_section, tab_label, tab_index } —
// see installCatalogRow's layout branch.

export interface CustomTab {
  /** workspace_integrations.id */
  id: string
  /** integrations.slug — also the workspace_integrations.provider value. */
  provider: string
  /** Display label on the tab. */
  label: string
  /** Sort order among customs in the same section. */
  index: number
  /** Path the tab links to. */
  to: string
}

const SECTION_ROUTE_PREFIX: Record<LayoutTargetSection, string> = {
  integrations: '/integrations/custom',
  storage: '/storage/custom',
  vault: '/vault/custom',
  dashboard: '/dashboard/custom',
}

/** Map a path like `/integrations/custom/abc` back to the section it belongs to.
 * Used by components (PageHeader) that need to call useCustomTabs without an
 * explicit section prop. Returns null if no known prefix matches. */
export function sectionFromPath(path: string): LayoutTargetSection | null {
  for (const s of KNOWN_TARGET_SECTIONS) {
    if (path.startsWith(`${SECTION_ROUTE_PREFIX[s]}/`)) return s
  }
  return null
}

export function useCustomTabs(section: LayoutTargetSection) {
  const { connections, catalog, refresh } = useMarketplace()
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  const tabs = computed<CustomTab[]>(() => {
    const out: CustomTab[] = []
    // Index the catalog by slug so we can look up the current name for each
    // installed layout in O(1). The tab label always reflects the catalog
    // row's name — re-publishing the layout with a new name updates every
    // workspace's tab automatically.
    const bySlug = new Map<string, { name: string }>()
    for (const item of catalog.value ?? []) {
      bySlug.set(item.id, { name: item.name })
    }
    for (const c of connections.value ?? []) {
      const m = (c.metadata ?? {}) as Record<string, unknown>
      if (m.kind !== 'layout') continue
      if (m.target_section !== section) continue
      const label = bySlug.get(c.provider)?.name ?? c.provider
      const index = typeof m.tab_index === 'number' ? m.tab_index : 0
      out.push({
        id: c.id,
        provider: c.provider,
        label,
        index,
        to: `${SECTION_ROUTE_PREFIX[section]}/${c.id}`,
      })
    }
    out.sort((a, b) => a.index - b.index)
    return out
  })

  async function reorder(orderedIds: string[]): Promise<void> {
    const wsId = currentWorkspace.value?.id
    if (!wsId) return
    try {
      await $fetch(`/api/workspaces/${wsId}/integrations/custom-order`, {
        method: 'PATCH',
        body: { section, order: orderedIds },
      })
      await refresh()
    }
    catch (err) {
      console.error('[useCustomTabs] reorder failed', err)
      const message = (err as { statusMessage?: string })?.statusMessage
        || 'Failed to save tab order.'
      toast.show(message, 'error')
      // Refresh anyway so the UI snaps back to the server's view of order.
      await refresh()
    }
  }

  return { tabs, reorder }
}
