import { pickDocsLocale, searchDocs } from '~~/server/utils/search/docsSearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  if (!q || q.length < 2) return { hits: [] }

  const localeParam = typeof query.locale === 'string' ? query.locale : undefined
  const cookie = getCookie(event, 'i18n_locale')
  const locale = pickDocsLocale(localeParam ?? cookie)

  const hits = await searchDocs(q, locale, 10)
  return { hits }
})
