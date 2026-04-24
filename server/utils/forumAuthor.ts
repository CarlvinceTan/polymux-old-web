type SupabaseUserLike = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

export function forumDisplayName(user: SupabaseUserLike): string {
  const meta = (user.user_metadata ?? null) as Record<string, unknown> | null
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : ''
  const name = typeof meta?.name === 'string' ? meta.name.trim() : ''
  const local = user.email?.split('@')[0]?.trim() ?? ''
  return full || name || local || 'Member'
}

export function forumInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'M'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export const FORUM_CATEGORIES = [
  'announcements',
  'help',
  'show-and-tell',
  'feedback',
  'workflows',
  'agents',
] as const

export type ForumCategory = typeof FORUM_CATEGORIES[number]

export function isForumCategory(value: unknown): value is ForumCategory {
  return typeof value === 'string' && (FORUM_CATEGORIES as readonly string[]).includes(value)
}
