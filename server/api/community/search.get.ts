import { serverSupabaseClient } from '#supabase/server'
import { pickDocsLocale, searchDocs } from '~~/server/utils/search/docsSearch'
import {
  buildSnippet,
  sanitizeIlikeTerm,
  scoreTextMatch,
  stripMarkdown,
} from '~~/server/utils/search/textSearch'

export type CommunitySearchSource = 'documentation' | 'forum' | 'blog'

export interface CommunitySearchHit {
  source: CommunitySearchSource
  title: string
  url: string
  snippet: string
  score: number
  meta?: string
}

const SOURCE_LIMIT = 5
const TOTAL_LIMIT = 15

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(max, Math.floor(n)))
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  if (!q || q.length < 2) return { hits: [] satisfies CommunitySearchHit[] }

  const localeParam = typeof query.locale === 'string' ? query.locale : undefined
  const cookie = getCookie(event, 'i18n_locale')
  const locale = pickDocsLocale(localeParam ?? cookie)
  const perSource = clampLimit(query.limit, SOURCE_LIMIT, 10)

  const supabase = await serverSupabaseClient(event)
  const ilikeTerm = sanitizeIlikeTerm(q)
  const now = new Date().toISOString()

  const [docHits, forumResult, blogResult] = await Promise.all([
    searchDocs(q, locale, perSource),
    supabase.rpc('list_forum_discussions', {
      p_category: null,
      p_sort: 'latest',
      p_search: q,
      p_limit: perSource,
      p_offset: 0,
    }),
    ilikeTerm
      ? supabase
          .from('blog_posts')
          .select('slug, title, excerpt, body_markdown, category')
          .not('published_at', 'is', null)
          .lte('published_at', now)
          .or(`title.ilike.%${ilikeTerm}%,excerpt.ilike.%${ilikeTerm}%,body_markdown.ilike.%${ilikeTerm}%`)
          .limit(perSource)
      : Promise.resolve({ data: [], error: null }),
  ])

  const hits: CommunitySearchHit[] = []

  for (const doc of docHits) {
    hits.push({
      source: 'documentation',
      title: doc.title,
      url: `/documentation/${doc.slug}`,
      snippet: doc.snippet,
      score: doc.score,
      meta: 'Documentation',
    })
  }

  if (forumResult.error) {
    console.error('[community-search] forum error', forumResult.error)
  } else {
    for (const discussion of forumResult.data ?? []) {
      const body = stripMarkdown(discussion.body ?? '')
      const score = scoreTextMatch(discussion.title ?? '', body, q)
      if (score === 0) continue

      hits.push({
        source: 'forum',
        title: discussion.title,
        url: `/forum/${discussion.id}`,
        snippet: buildSnippet(body, q),
        score,
        meta: 'Forum',
      })
    }
  }

  if (blogResult.error) {
    console.error('[community-search] blog error', blogResult.error)
  } else {
    for (const post of blogResult.data ?? []) {
      const body = stripMarkdown(post.body_markdown ?? '')
      const searchable = `${post.excerpt ?? ''} ${body}`.trim()
      const score = scoreTextMatch(post.title ?? '', searchable, q)
      if (score === 0) continue

      hits.push({
        source: 'blog',
        title: post.title,
        url: `/blog/${post.slug}`,
        snippet: buildSnippet(post.excerpt || body, q),
        score,
        meta: post.category ? `Blog · ${post.category}` : 'Blog',
      })
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return { hits: hits.slice(0, TOTAL_LIMIT) }
})
