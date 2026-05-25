export function firstIndexCI(haystack: string, needle: string): number {
  if (!needle) return -1
  return haystack.toLowerCase().indexOf(needle.toLowerCase())
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  let count = 0
  let i = 0
  while ((i = h.indexOf(n, i)) !== -1) {
    count++
    i += n.length
  }
  return count
}

export function buildSnippet(text: string, query: string): string {
  const idx = firstIndexCI(text, query)
  if (idx === -1) return text.slice(0, 140).trim() + (text.length > 140 ? '…' : '')
  const radius = 60
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end).trim() + suffix
}

export function scoreTextMatch(title: string, body: string, query: string): number {
  const titleHits = countOccurrences(title, query)
  const bodyHits = countOccurrences(body, query)
  if (titleHits === 0 && bodyHits === 0) return 0
  return titleHits * 100 + Math.min(bodyHits, 20) * 5
}

/** Strip characters that break PostgREST filters or act as LIKE wildcards. */
export function sanitizeIlikeTerm(value: string): string {
  return value.replace(/[%_\\,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractMarkdownTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m)
  return m?.[1]?.trim() ?? ''
}
