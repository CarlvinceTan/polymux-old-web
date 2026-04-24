export const FORUM_CATEGORIES = [
  'announcements',
  'help',
  'show-and-tell',
  'feedback',
  'workflows',
  'agents',
] as const

export type ForumCategorySlug = typeof FORUM_CATEGORIES[number]

export type ForumCategoryTone
  = 'slate' | 'sky' | 'amber' | 'emerald' | 'violet' | 'indigo'

export interface ForumCategoryMeta {
  slug: ForumCategorySlug
  label: string
  description: string
  icon: string
  tone: ForumCategoryTone
}

export interface ForumDiscussionSummary {
  id: string
  category: ForumCategorySlug
  title: string
  body: string
  author_id: string
  author_name: string
  author_initials: string
  pinned: boolean
  answered: boolean
  views: number
  reply_count: number
  last_activity_at: string
  created_at: string
}

export interface ForumDiscussion extends Omit<ForumDiscussionSummary, 'reply_count' | 'last_activity_at'> {
  updated_at: string
}

export interface ForumReply {
  id: string
  discussion_id: string
  body: string
  author_id: string
  author_name: string
  author_initials: string
  created_at: string
}

export const FORUM_CATEGORY_META: ForumCategoryMeta[] = [
  {
    slug: 'announcements',
    label: 'Announcements',
    description: 'Product updates and community news',
    icon: 'i-heroicons-megaphone-20-solid',
    tone: 'slate',
  },
  {
    slug: 'help',
    label: 'Help & Support',
    description: 'Ask questions, troubleshoot issues',
    icon: 'i-heroicons-lifebuoy-20-solid',
    tone: 'sky',
  },
  {
    slug: 'show-and-tell',
    label: 'Show & Tell',
    description: 'Share what you built with Polymux',
    icon: 'i-heroicons-sparkles-20-solid',
    tone: 'amber',
  },
  {
    slug: 'feedback',
    label: 'Feedback & Ideas',
    description: 'Shape what we build next',
    icon: 'i-heroicons-light-bulb-20-solid',
    tone: 'emerald',
  },
  {
    slug: 'workflows',
    label: 'Workflows',
    description: 'Blueprints, templates, recipes',
    icon: 'i-heroicons-squares-2x2-20-solid',
    tone: 'violet',
  },
  {
    slug: 'agents',
    label: 'Agents',
    description: 'Prompts, tuning, comparing runs',
    icon: 'i-heroicons-cpu-chip-20-solid',
    tone: 'indigo',
  },
]

export const FORUM_TONE_CLASS: Record<ForumCategoryTone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  sky: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

export function forumCategoryBySlug(slug: string): ForumCategoryMeta | undefined {
  return FORUM_CATEGORY_META.find(c => c.slug === slug)
}

export function formatForumViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
