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
  title: string
  entries: DocsNavEntry[]
}

const SECTIONS: DocsNavSection[] = [
  {
    title: 'Getting started',
    entries: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'quickstart', title: 'Quickstart' },
      { slug: 'installation', title: 'Installation' },
    ],
  },
  {
    title: 'Using Polymux',
    entries: [
      { slug: 'workspaces', title: 'Workspaces and members' },
      { slug: 'vault', title: 'Vault basics' },
      { slug: 'faq', title: 'FAQ' },
    ],
  },
  {
    title: 'Building plugins',
    entries: [
      { slug: 'plugin-overview', title: 'Plugin overview' },
      { slug: 'plugin-build', title: 'Build your first plugin' },
      { slug: 'plugin-manifest', title: 'Manifest reference' },
      { slug: 'publishing', title: 'Publishing checklist' },
    ],
  },
  {
    title: 'Connections',
    entries: [
      { slug: 'connections-overview', title: 'Connections overview' },
      { slug: 'connections-build', title: 'Building a connection' },
    ],
  },
  {
    title: 'API',
    entries: [
      { slug: 'api-overview', title: 'API overview' },
      { slug: 'authentication', title: 'Authentication' },
    ],
  },
]

const FLAT: DocsNavEntry[] = SECTIONS.flatMap((s) => s.entries)

export const DEFAULT_DOC_SLUG = 'introduction'

export function useDocsNav() {
  function findEntry(slug: string): DocsNavEntry | null {
    return FLAT.find((e) => e.slug === slug) ?? null
  }

  function neighbours(slug: string): { prev: DocsNavEntry | null; next: DocsNavEntry | null } {
    const i = FLAT.findIndex((e) => e.slug === slug)
    if (i === -1) return { prev: null, next: null }
    return {
      prev: i > 0 ? FLAT[i - 1] ?? null : null,
      next: i < FLAT.length - 1 ? FLAT[i + 1] ?? null : null,
    }
  }

  return {
    sections: SECTIONS,
    flat: FLAT,
    findEntry,
    neighbours,
  }
}
