import { serverSupabaseClient } from '#supabase/server'
import { isForumCategory } from '~~/server/utils/forumAuthor'

const ALLOWED_SORTS = ['latest', 'top', 'unanswered'] as const
type Sort = typeof ALLOWED_SORTS[number]

function normaliseSort(value: unknown): Sort {
  return typeof value === 'string' && (ALLOWED_SORTS as readonly string[]).includes(value)
    ? (value as Sort)
    : 'latest'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)

  const category = typeof q.category === 'string' && isForumCategory(q.category) ? q.category : null
  const sort = normaliseSort(q.sort)
  const rawSearch = typeof q.search === 'string' ? q.search.trim() : ''
  const search = rawSearch.length > 0 && rawSearch.length <= 200 ? rawSearch : null
  const limit = clamp(Number(q.limit ?? 50) || 50, 1, 100)
  const offset = clamp(Number(q.offset ?? 0) || 0, 0, 10000)

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase.rpc('list_forum_discussions', {
    p_category: category,
    p_sort: sort,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    console.error('[forum] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load discussions.' })
  }

  return { discussions: data ?? [] }
})
