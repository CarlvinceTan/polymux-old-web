import {
  buildSnippet,
  countOccurrences,
  extractMarkdownTitle,
  stripMarkdown,
} from '~~/server/utils/search/textSearch'

const SUPPORTED_LOCALES = new Set([
  'en',
  'es',
  'fr',
  'de',
  'ja',
  'zh',
  'pt',
  'ko',
])
const DEFAULT_LOCALE = 'en'

export interface DocSearchHit {
  slug: string
  title: string
  snippet: string
  /** 0–N — higher means stronger match. */
  score: number
}

export function pickDocsLocale(value: string | undefined): string {
  if (!value) return DEFAULT_LOCALE
  return SUPPORTED_LOCALES.has(value) ? value : DEFAULT_LOCALE
}

export async function searchDocs(
  query: string,
  locale: string,
  limit = 10,
): Promise<DocSearchHit[]> {
  const q = query.trim()
  if (!q || q.length < 2) return []

  const storage = useStorage('assets:docs')

  let keys = (await storage.getKeys(locale)).filter(k => k.endsWith('.md'))
  let sourceLocale = locale

  if (!keys.length && locale !== DEFAULT_LOCALE) {
    keys = (await storage.getKeys(DEFAULT_LOCALE)).filter(k => k.endsWith('.md'))
    sourceLocale = DEFAULT_LOCALE
  }

  if (!keys.length) return []

  const hits: DocSearchHit[] = []

  await Promise.all(
    keys.map(async (key) => {
      const slug = key
        .slice(sourceLocale.length + 1)
        .replace(/\.md$/, '')
        .replace(/:/g, '/')

      let raw = await storage.getItem<string>(key)
      if (!raw && sourceLocale !== DEFAULT_LOCALE) {
        raw = await storage.getItem<string>(`${DEFAULT_LOCALE}/${slug}.md`)
      }
      if (!raw) return

      const title = extractMarkdownTitle(raw) || slug
      const body = stripMarkdown(raw)

      const titleHits = countOccurrences(title, q)
      const bodyHits = countOccurrences(body, q)
      if (titleHits === 0 && bodyHits === 0) return

      const score = titleHits * 100 + Math.min(bodyHits, 20) * 5

      hits.push({ slug, title, snippet: buildSnippet(body, q), score })
    }),
  )

  hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
  return hits.slice(0, limit)
}
