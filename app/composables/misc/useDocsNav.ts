/**
 * Single source of truth for the /documentation sidebar order and grouping.
 *
 * Each entry's `slug` matches a file under `web/content/docs/<slug>.md`. The
 * flattened order also drives the previous/next links at the bottom of every
 * doc page, so reordering here changes both the sidebar and the prev/next
 * chain.
 */

export interface DocsNavEntry {
  slug: string
  title: string
}

export interface DocsNavSection {
  id: string
  title: string
  entries: DocsNavEntry[]
}

const SECTION_DEFS = [
  {
    id: 'gettingStarted',
    titleKey: 'docs.nav.sections.gettingStarted',
    entries: [
      { slug: 'introduction', titleKey: 'docs.nav.entries.introduction' },
      { slug: 'quickstart', titleKey: 'docs.nav.entries.quickstart' },
      { slug: 'installation', titleKey: 'docs.nav.entries.installation' },
    ],
  },
  {
    id: 'usingPolymux',
    titleKey: 'docs.nav.sections.usingPolymux',
    entries: [
      { slug: 'workspaces', titleKey: 'docs.nav.entries.workspaces' },
      { slug: 'vault', titleKey: 'docs.nav.entries.vault' },
      { slug: 'faq', titleKey: 'docs.nav.entries.faq' },
    ],
  },
  {
    id: 'buildingPlugins',
    titleKey: 'docs.nav.sections.buildingPlugins',
    entries: [
      { slug: 'plugin-overview', titleKey: 'docs.nav.entries.pluginOverview' },
      { slug: 'plugin-build', titleKey: 'docs.nav.entries.pluginBuild' },
      { slug: 'plugin-manifest', titleKey: 'docs.nav.entries.pluginManifest' },
      { slug: 'publishing', titleKey: 'docs.nav.entries.publishing' },
    ],
  },
  {
    id: 'connections',
    titleKey: 'docs.nav.sections.connections',
    entries: [
      { slug: 'connections-overview', titleKey: 'docs.nav.entries.connectionsOverview' },
      { slug: 'connections-build', titleKey: 'docs.nav.entries.connectionsBuild' },
      { slug: 'connections-port', titleKey: 'docs.nav.entries.connectionsPort' },
    ],
  },
  {
    id: 'api',
    titleKey: 'docs.nav.sections.api',
    entries: [
      { slug: 'api-overview', titleKey: 'docs.nav.entries.apiOverview' },
      { slug: 'authentication', titleKey: 'docs.nav.entries.authentication' },
    ],
  },
] as const

export const DEFAULT_DOC_SLUG = 'introduction'

export function useDocsNav() {
  const { t } = useI18n()

  const sections = computed<DocsNavSection[]>(() =>
    SECTION_DEFS.map(section => ({
      id: section.id,
      title: t(section.titleKey),
      entries: section.entries.map(entry => ({
        slug: entry.slug,
        title: t(entry.titleKey),
      })),
    })),
  )

  const flat = computed(() => sections.value.flatMap(section => section.entries))

  function findEntry(slug: string): DocsNavEntry | null {
    return flat.value.find(entry => entry.slug === slug) ?? null
  }

  function neighbours(slug: string): { prev: DocsNavEntry | null, next: DocsNavEntry | null } {
    const entries = flat.value
    const i = entries.findIndex(entry => entry.slug === slug)
    if (i === -1) return { prev: null, next: null }
    return {
      prev: i > 0 ? entries[i - 1] ?? null : null,
      next: i < entries.length - 1 ? entries[i + 1] ?? null : null,
    }
  }

  return {
    sections,
    flat,
    findEntry,
    neighbours,
  }
}
