export type AttachmentToken<A> = { kind: 'text'; text: string } | { kind: 'chip'; att: A }

/**
 * Walk a text + positioned-attachment list and produce an ordered token
 * stream interleaving text segments and chips. Attachments without a
 * numeric `position` are pinned to the end. Same algorithm is used by the
 * inline editor's mount-time layout and the display-mode message renderer.
 */
export function interleaveAttachments<A extends { position?: number }>(
  text: string,
  attachments: A[],
): AttachmentToken<A>[] {
  const sorted = attachments
    .map((a, i) => ({ a, i, pos: typeof a.position === 'number' ? a.position : Number.POSITIVE_INFINITY }))
    .sort((x, y) => x.pos - y.pos || x.i - y.i)
  const tokens: AttachmentToken<A>[] = []
  let cursor = 0
  for (const { a, pos } of sorted) {
    const clamped = pos === Number.POSITIVE_INFINITY ? text.length : Math.max(0, Math.min(pos, text.length))
    if (clamped > cursor) {
      tokens.push({ kind: 'text', text: text.slice(cursor, clamped) })
      cursor = clamped
    }
    tokens.push({ kind: 'chip', att: a })
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens
}
