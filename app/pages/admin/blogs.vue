<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Blogs — maintainer surface for drafting, editing, and publishing posts to
// polymux.com/blog. Ported from the console's Blogs page into web's admin shell
// (light/rounded instead of the console's Zed-dark look).
//
// The console talked to public.blog_posts directly via useSupabaseClient(). The
// web admin instead goes through service-role endpoints under
// /api/admin/blogs/* (gated by requireMaintainer), so this page never needs the
// anon key and the dev/prod env switch (shared by every admin page) applies.
//
// Layout: three columns — post list (280px), metadata + markdown editor, and a
// polymux.com-styled live preview that re-renders (rAF-debounced) as you type.

import { marked } from 'marked'

interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  body_markdown: string
  category: string | null
  accent: string
  cover_image_url: string | null
  published_at: string | null
  author_id: string | null
  created_at: string
  updated_at: string
}

const ACCENTS = ['slate', 'zinc', 'stone'] as const
type Accent = (typeof ACCENTS)[number]

const env = ref('dev')
const availableEnvs = ref<string[]>(['dev'])
const posts = ref<BlogPost[]>([])
const loading = ref(false)
const forbidden = ref(false)
const loadError = ref('')

const selectedId = ref<string | null>(null)
const draft = ref<BlogPost | null>(null)
// Snapshot at edit-start so we can detect unsaved changes without a deep diff on
// every keystroke. JSON.stringify is fine here — the row is tiny.
const original = ref('')

const saving = ref(false)
const busy = ref(false)
const toast = ref('')

const search = ref('')

function flash(m: string) {
  toast.value = m
  setTimeout(() => { if (toast.value === m) toast.value = '' }, 2500)
}
function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}
function isForbidden(e: any): boolean {
  return e?.statusCode === 403 || e?.response?.status === 403
}

const filtered = computed<BlogPost[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return posts.value
  return posts.value.filter(p =>
    p.title.toLowerCase().includes(q)
    || p.slug.toLowerCase().includes(q)
    || (p.category ?? '').toLowerCase().includes(q),
  )
})

const dirty = computed(() => {
  if (!draft.value) return false
  return JSON.stringify(draft.value) !== original.value
})

const statusLabel = computed<'draft' | 'scheduled' | 'published'>(() => {
  const p = draft.value
  if (!p?.published_at) return 'draft'
  return new Date(p.published_at).getTime() > Date.now() ? 'scheduled' : 'published'
})

async function load() {
  loading.value = true
  forbidden.value = false
  loadError.value = ''
  try {
    const res = await adminFetch<{ env: string, available_envs: string[], posts: BlogPost[] }>('/api/admin/blogs')
    env.value = res.env
    availableEnvs.value = res.available_envs
    posts.value = res.posts
    // Preserve the current selection if it's still present; otherwise pick the
    // first row so the editor never goes blank after a refresh.
    if (selectedId.value && posts.value.some(p => p.id === selectedId.value)) {
      applySelection(selectedId.value)
    }
    else if (posts.value.length > 0) {
      applySelection(posts.value[0]!.id)
    }
    else {
      draft.value = null
      original.value = ''
      selectedId.value = null
    }
  }
  catch (e: any) {
    if (isForbidden(e)) forbidden.value = true
    else loadError.value = errMsg(e)
    posts.value = []
  }
  finally {
    loading.value = false
  }
}

async function switchEnv(next: string) {
  if (next === env.value || busy.value) return
  if (dirty.value && !confirm('Discard unsaved changes?')) return
  busy.value = true
  try {
    const r = await adminFetch<{ env: string }>('/api/admin/env', { method: 'POST', body: { env: next } })
    env.value = r.env
    selectedId.value = null
    draft.value = null
    original.value = ''
    await load()
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    busy.value = false
  }
}

function applySelection(id: string) {
  const p = posts.value.find(x => x.id === id)
  if (!p) return
  selectedId.value = id
  draft.value = { ...p }
  original.value = JSON.stringify(draft.value)
}

function selectPost(id: string) {
  if (id === selectedId.value) return
  if (dirty.value && !confirm('Discard unsaved changes?')) return
  applySelection(id)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function createPost() {
  if (dirty.value && !confirm('Discard unsaved changes?')) return
  saving.value = true
  try {
    const res = await adminFetch<{ post: BlogPost }>('/api/admin/blogs', { method: 'POST', body: {} })
    posts.value = [res.post, ...posts.value]
    applySelection(res.post.id)
    flash('Draft created')
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    saving.value = false
  }
}

async function save() {
  if (!draft.value) return
  saving.value = true
  try {
    const d = draft.value
    const res = await adminFetch<{ post: BlogPost }>(`/api/admin/blogs/${d.id}`, {
      method: 'PATCH',
      body: {
        slug: d.slug,
        title: d.title,
        excerpt: d.excerpt,
        body_markdown: d.body_markdown,
        category: d.category,
        accent: d.accent,
        cover_image_url: d.cover_image_url,
        published_at: d.published_at,
      },
    })
    const saved = res.post
    posts.value = posts.value.map(p => p.id === saved.id ? saved : p)
    draft.value = { ...saved }
    original.value = JSON.stringify(draft.value)
    flash('Saved')
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    saving.value = false
  }
}

async function publishNow() {
  if (!draft.value) return
  draft.value.published_at = new Date().toISOString()
  await save()
}

async function unpublish() {
  if (!draft.value) return
  if (!confirm('Unpublish this post? It will be hidden from polymux.com/blog.')) return
  draft.value.published_at = null
  await save()
}

async function deletePost() {
  if (!draft.value) return
  if (!confirm(`Delete "${draft.value.title}"? This cannot be undone.`)) return
  const id = draft.value.id
  saving.value = true
  try {
    await adminFetch(`/api/admin/blogs/${id}`, { method: 'DELETE' })
    posts.value = posts.value.filter(p => p.id !== id)
    selectedId.value = null
    draft.value = null
    original.value = ''
    if (posts.value[0]) applySelection(posts.value[0].id)
    flash('Deleted')
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    saving.value = false
  }
}

// Auto-slug from title for unpublished drafts only. Once a post is live we leave
// the slug alone — changing it would break shared URLs. We only overwrite when
// the slug still looks like the autogenerated "untitled[-N]" placeholder, so a
// maintainer who renamed it by hand isn't fighting the autofill.
watch(() => draft.value?.title, (next) => {
  if (!draft.value) return
  if (draft.value.published_at) return
  if (!next) return
  const current = draft.value.slug
  const looksAuto = /^[a-z0-9-]+$/.test(current)
  if (!looksAuto) return
  const nextSlug = slugify(next)
  if (nextSlug && nextSlug !== current) {
    if (/^untitled(-\d+)?$/.test(current) || current === '') {
      draft.value.slug = nextSlug
    }
  }
})

// Live markdown preview. Same library as the rest of the app, but inline so we
// can scope the light/serif blog styling to .blog-preview without leaking it
// into the admin shell. dompurify sanitises before v-html injection.
const previewHtml = ref('')
type Sanitizer = (input: string) => string
let sanitizer: Sanitizer | null = null
let pendingFrame: number | null = null
let pendingSource = ''

async function renderPreview(source: string) {
  if (typeof window === 'undefined') {
    previewHtml.value = ''
    return
  }
  if (!sanitizer) {
    const mod = await import('dompurify')
    const purify = mod.default
    sanitizer = (s: string) => purify.sanitize(s)
  }
  const parsed = marked.parse(source || '', { async: false, gfm: true }) as string
  previewHtml.value = sanitizer(parsed)
}

function schedulePreview(source: string) {
  pendingSource = source
  if (typeof window === 'undefined') {
    renderPreview(source)
    return
  }
  if (pendingFrame != null) return
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null
    renderPreview(pendingSource)
  })
}

watch(() => draft.value?.body_markdown ?? '', (next) => {
  schedulePreview(next)
}, { immediate: true })

onBeforeUnmount(() => {
  if (pendingFrame != null) cancelAnimationFrame(pendingFrame)
})

const accentClass: Record<Accent, string> = {
  slate: 'from-slate-200 to-slate-100',
  zinc: 'from-zinc-200 to-zinc-100',
  stone: 'from-stone-200 to-stone-100',
}

function postStatus(p: BlogPost): 'draft' | 'scheduled' | 'published' {
  if (!p.published_at) return 'draft'
  return new Date(p.published_at).getTime() > Date.now() ? 'scheduled' : 'published'
}

const STATUS_DOT: Record<'draft' | 'scheduled' | 'published', string> = {
  draft: 'bg-neutral-300',
  scheduled: 'bg-amber-400',
  published: 'bg-green-500',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace('T', ' ')
}

// `<input type=datetime-local>` wants `YYYY-MM-DDTHH:mm`; the DB stores ISO 8601
// with offset. Round-trip via the user's local time zone so the input shows what
// the maintainer expects.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const publishedAtInput = computed<string>({
  get() {
    return isoToLocalInput(draft.value?.published_at ?? null)
  },
  set(v) {
    if (!draft.value) return
    draft.value.published_at = localInputToIso(v)
  },
})

const previewDateLabel = computed<string>(() => {
  const iso = draft.value?.published_at
  if (!iso) return 'Draft'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Draft'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <header class="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Blogs</h1>
        <p class="text-label-md text-neutral-500">Draft, edit, and publish posts to polymux.com/blog.</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
          <span class="text-label-md text-neutral-500">Env</span>
          <select :value="env" class="bg-transparent text-body-md font-medium text-neutral-950 outline-none" :disabled="busy" @change="switchEnv(($event.target as HTMLSelectElement).value)">
            <option v-for="e in availableEnvs" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
      </div>
    </header>

    <p v-if="loadError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ loadError }}</p>

    <div v-if="forbidden" class="py-16 text-center text-body-md text-neutral-500">Maintainers only.</div>
    <div v-else class="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] gap-4">
      <!-- Posts list -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-150 px-3 py-2.5">
          <span class="text-label-md font-semibold uppercase tracking-wide text-neutral-400">Posts ({{ filtered.length }})</span>
          <button
            type="button"
            class="rounded-md bg-neutral-950 px-2.5 py-1 text-label-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            :disabled="saving"
            @click="createPost"
          >
            + New
          </button>
        </div>
        <div class="shrink-0 border-b border-neutral-150 p-2">
          <input
            v-model="search"
            type="search"
            placeholder="Search…"
            class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
          >
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="loading && posts.length === 0" class="p-4 text-body-md text-neutral-400">Loading…</div>
          <div v-else-if="filtered.length === 0" class="p-4 text-body-md text-neutral-400">
            {{ search ? 'No matches.' : 'No posts yet. Click + New to create one.' }}
          </div>
          <ul v-else>
            <li
              v-for="p in filtered"
              :key="p.id"
              class="cursor-pointer border-b border-neutral-100 px-3 py-2.5 transition-colors last:border-0 hover:bg-neutral-50"
              :class="selectedId === p.id ? 'bg-neutral-100' : ''"
              @click="selectPost(p.id)"
            >
              <div class="flex items-center gap-2">
                <span class="size-2 shrink-0 rounded-full" :class="STATUS_DOT[postStatus(p)]" :title="postStatus(p)" />
                <span class="truncate text-body-md font-medium text-neutral-950">{{ p.title || '(untitled)' }}</span>
              </div>
              <div class="mt-0.5 truncate font-mono text-label-md text-neutral-400" :title="p.slug">/{{ p.slug }}</div>
              <div class="mt-0.5 text-label-md text-neutral-400">{{ fmtDate(p.published_at ?? p.updated_at) }}</div>
            </li>
          </ul>
        </div>
      </section>

      <!-- Editor -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-150 px-3 py-2.5">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-label-md font-semibold uppercase tracking-wide text-neutral-400">
              {{ draft ? `Edit · ${draft.slug}` : 'Editor' }}
            </span>
            <span v-if="draft" class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full" :class="STATUS_DOT[statusLabel]" />
              <span class="text-label-md font-medium uppercase tracking-wide text-neutral-500">{{ statusLabel }}</span>
              <span v-if="dirty" class="text-label-md font-medium text-amber-600">· unsaved</span>
            </span>
          </div>
          <div v-if="draft" class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="rounded-md bg-neutral-950 px-2.5 py-1 text-label-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              :disabled="saving || !dirty"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button
              v-if="statusLabel === 'draft'"
              type="button"
              class="rounded-md px-2.5 py-1 text-label-md font-medium text-green-700 transition hover:bg-green-50 disabled:opacity-40"
              :disabled="saving"
              @click="publishNow"
            >
              Publish
            </button>
            <button
              v-else
              type="button"
              class="rounded-md px-2.5 py-1 text-label-md font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
              :disabled="saving"
              @click="unpublish"
            >
              Unpublish
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-label-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              :disabled="saving"
              @click="deletePost"
            >
              Delete
            </button>
          </div>
        </div>

        <div v-if="!draft" class="flex flex-1 items-center justify-center p-6 text-body-md text-neutral-400">
          Select a post or create a new one.
        </div>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <div class="grid shrink-0 grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-neutral-150 p-3">
            <label class="self-center text-label-md text-neutral-500">Title</label>
            <input v-model="draft.title" placeholder="Post title" class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400">
            <label class="self-center text-label-md text-neutral-500">Slug</label>
            <input v-model="draft.slug" placeholder="my-post-slug" class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2.5 font-mono text-body-md text-neutral-950 outline-none focus:border-neutral-400">
            <label class="self-start pt-1.5 text-label-md text-neutral-500">Excerpt</label>
            <textarea v-model="draft.excerpt" rows="2" placeholder="One- or two-sentence summary shown on the index" class="w-full resize-none rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400" />
            <label class="self-center text-label-md text-neutral-500">Category</label>
            <input v-model="draft.category" placeholder="Product, Security, Platform, …" class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400">
            <label class="self-center text-label-md text-neutral-500">Accent</label>
            <select v-model="draft.accent" class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2 text-body-md text-neutral-950 outline-none focus:border-neutral-400">
              <option v-for="a in ACCENTS" :key="a" :value="a">{{ a }}</option>
            </select>
            <label class="self-center text-label-md text-neutral-500">Cover image</label>
            <input v-model="draft.cover_image_url" placeholder="Optional https://… URL" class="h-8 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400">
            <label class="self-center text-label-md text-neutral-500">Publish at</label>
            <div class="flex items-center gap-2">
              <input v-model="publishedAtInput" type="datetime-local" class="h-8 flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400">
              <button
                v-if="draft.published_at"
                type="button"
                class="rounded-md px-2 py-1 text-label-md font-medium text-neutral-500 transition hover:bg-neutral-100"
                @click="draft.published_at = null"
              >
                Clear
              </button>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="shrink-0 border-b border-neutral-150 bg-neutral-50/60 px-3 py-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">
              Markdown
            </div>
            <textarea
              v-model="draft.body_markdown"
              class="min-h-0 w-full flex-1 resize-none bg-white p-3 font-mono text-body-md leading-relaxed text-neutral-950 outline-none"
              spellcheck="false"
              placeholder="# Heading

Write your post in Markdown. Use **bold**, _italic_, `code`, lists, and links."
            />
          </div>
        </div>
      </section>

      <!-- Preview (styled like polymux.com/blog/[slug]) -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-neutral-150 px-3 py-2.5">
          <span class="text-label-md font-semibold uppercase tracking-wide text-neutral-400">Preview</span>
          <span class="text-label-md text-neutral-400">polymux.com look</span>
        </div>
        <div v-if="!draft" class="flex flex-1 items-center justify-center p-6 text-body-md text-neutral-400">
          Nothing to preview.
        </div>
        <div v-else class="min-h-0 flex-1 overflow-y-auto bg-white">
          <article class="blog-preview mx-auto max-w-[680px] px-6 py-12 sm:px-8 sm:py-16">
            <div class="text-center">
              <p class="blog-preview-meta">
                <time>{{ previewDateLabel }}</time>
                <template v-if="draft.category">
                  <span aria-hidden="true">·</span>
                  <span>{{ draft.category }}</span>
                </template>
              </p>
              <h1 class="blog-preview-title">{{ draft.title || 'Untitled' }}</h1>
              <p v-if="draft.excerpt" class="blog-preview-excerpt">{{ draft.excerpt }}</p>
            </div>
            <div
              class="blog-preview-thumb"
              :class="accentClass[(draft.accent as Accent) ?? 'slate']"
              aria-hidden="true"
            />
            <!-- eslint-disable-next-line vue/no-v-html — sanitized via dompurify above -->
            <div class="blog-preview-body" v-html="previewHtml" />
          </article>
        </div>
      </section>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* Light-themed preview that mirrors polymux.com's blog post layout. Scoped so it
   doesn't leak into the surrounding admin UI. Everything here is intentionally
   explicit (colours, fonts, sizes) so it survives regardless of the admin shell
   styles. */
.blog-preview {
  color: #0a0a0a;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.7;
}
.blog-preview-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #737373;
  letter-spacing: 0.01em;
}
.blog-preview-title {
  margin-top: 1rem;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  font-size: 2.25rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: #0a0a0a;
  font-weight: 600;
}
.blog-preview-excerpt {
  margin: 1.25rem auto 0;
  max-width: 32rem;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: #525252;
}
.blog-preview-thumb {
  margin: 2.5rem 0 2rem;
  aspect-ratio: 16 / 9;
  width: 100%;
  background-image: linear-gradient(to bottom right, var(--tw-gradient-stops));
}
.blog-preview-body {
  margin-top: 1.5rem;
  font-size: 1.0625rem;
  line-height: 1.75;
  color: #262626;
}
.blog-preview-body :deep(h1),
.blog-preview-body :deep(h2),
.blog-preview-body :deep(h3),
.blog-preview-body :deep(h4) {
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  color: #0a0a0a;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 2rem 0 0.75rem;
}
.blog-preview-body :deep(h1) { font-size: 1.875rem; }
.blog-preview-body :deep(h2) { font-size: 1.5rem; }
.blog-preview-body :deep(h3) { font-size: 1.25rem; }
.blog-preview-body :deep(h4) { font-size: 1.125rem; }
.blog-preview-body :deep(p),
.blog-preview-body :deep(ul),
.blog-preview-body :deep(ol),
.blog-preview-body :deep(blockquote),
.blog-preview-body :deep(pre),
.blog-preview-body :deep(table) {
  margin: 0 0 1.1rem 0;
}
.blog-preview-body :deep(ul),
.blog-preview-body :deep(ol) {
  padding-left: 1.5rem;
}
.blog-preview-body :deep(ul) { list-style: disc; }
.blog-preview-body :deep(ol) { list-style: decimal; }
.blog-preview-body :deep(li) {
  margin: 0.4rem 0;
}
.blog-preview-body :deep(a) {
  color: #0a0a0a;
  text-decoration: underline;
  text-decoration-color: #d4d4d4;
  text-underline-offset: 0.2em;
}
.blog-preview-body :deep(a:hover) {
  text-decoration-color: #737373;
}
.blog-preview-body :deep(strong) { font-weight: 600; color: #0a0a0a; }
.blog-preview-body :deep(em) { font-style: italic; }
.blog-preview-body :deep(blockquote) {
  border-left: 3px solid #d4d4d4;
  padding-left: 1rem;
  color: #525252;
  font-style: italic;
}
.blog-preview-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: #f5f5f5;
  padding: 0.1rem 0.35rem;
  border: 1px solid #e5e5e5;
  border-radius: 0.25rem;
}
.blog-preview-body :deep(pre) {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.55;
}
.blog-preview-body :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: inherit;
}
.blog-preview-body :deep(hr) {
  border: 0;
  border-top: 1px solid #e5e5e5;
  margin: 2rem 0;
}
.blog-preview-body :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5rem 0;
  border-radius: 0.5rem;
}
.blog-preview-body :deep(table) {
  border-collapse: collapse;
  font-size: 0.95rem;
}
.blog-preview-body :deep(th),
.blog-preview-body :deep(td) {
  border: 1px solid #e5e5e5;
  padding: 0.4rem 0.7rem;
  text-align: left;
}
</style>
