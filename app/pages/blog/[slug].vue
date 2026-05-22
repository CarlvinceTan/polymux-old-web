<script setup lang="ts">
import { marked } from 'marked'

definePageMeta({ layout: 'landing' })

interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  body_markdown: string
  category: string | null
  accent: string
  cover_image_url: string | null
  published_at: string
}

const route = useRoute()
const supabase = useSupabaseClient()
const slug = computed<string>(() => String(route.params.slug ?? ''))

const { data: post, error } = await useAsyncData<BlogPost | null>(
  () => `blog-post-${slug.value}`,
  async () => {
    if (!slug.value) return null
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, body_markdown, category, accent, cover_image_url, published_at')
      .eq('slug', slug.value)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .maybeSingle()
    if (error) {
      console.error('[blog/[slug]] fetch error:', error)
      return null
    }
    return (data ?? null) as BlogPost | null
  },
  { watch: [slug] },
)

if (error.value || !post.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const ACCENT_CLASSES: Record<string, string> = {
  slate: 'from-slate-200 to-slate-100',
  zinc: 'from-zinc-200 to-zinc-100',
  stone: 'from-stone-200 to-stone-100',
}

const accentClass = computed<string>(() =>
  ACCENT_CLASSES[post.value?.accent ?? 'slate'] ?? ACCENT_CLASSES.slate!,
)

const dateLabel = computed<string>(() => {
  if (!post.value?.published_at) return ''
  const d = new Date(post.value.published_at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
})

// Render markdown synchronously so it ships in the SSR HTML — important for
// crawlers and for paint-without-JS.
const bodyHtml = computed<string>(() => {
  const src = post.value?.body_markdown ?? ''
  if (!src) return ''
  return marked.parse(src, { async: false, gfm: true }) as string
})

useHead(() => ({
  title: post.value ? `${post.value.title} — Polymux Blog` : 'Blog',
  meta: [
    { name: 'description', content: post.value?.excerpt ?? '' },
    { property: 'og:title', content: post.value?.title ?? '' },
    { property: 'og:description', content: post.value?.excerpt ?? '' },
    { property: 'og:type', content: 'article' },
    ...(post.value?.cover_image_url ? [{ property: 'og:image', content: post.value.cover_image_url }] : []),
    ...(post.value?.published_at ? [{ property: 'article:published_time', content: post.value.published_at }] : []),
  ],
}))
</script>

<template>
  <div v-if="post" class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <article class="w-full max-w-[680px]">
      <NuxtLink
        to="/blog"
        class="inline-flex items-center text-[0.8125rem] text-neutral-500 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-800"
      >
        &larr; All posts
      </NuxtLink>

      <header class="mt-8 text-center">
        <p class="flex items-center justify-center gap-2 text-[0.8125rem] text-neutral-500">
          <time :datetime="post.published_at">{{ dateLabel }}</time>
          <template v-if="post.category">
            <span aria-hidden="true" class="text-neutral-300">&middot;</span>
            <span>{{ post.category }}</span>
          </template>
        </p>
        <h1 class="mt-4 font-serif text-[2.5rem] leading-[1.1] tracking-tight text-neutral-950 sm:text-[3rem]">
          {{ post.title }}
        </h1>
        <p v-if="post.excerpt" class="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ post.excerpt }}
        </p>
      </header>

      <div
        class="mt-10 aspect-[16/9] w-full overflow-hidden bg-gradient-to-br"
        :class="accentClass"
        aria-hidden="true"
      >
        <img
          v-if="post.cover_image_url"
          :src="post.cover_image_url"
          :alt="post.title"
          class="h-full w-full object-cover"
        />
      </div>

      <div class="blog-body mt-10" v-html="bodyHtml" />
    </article>
  </div>
</template>

<style scoped>
.blog-body {
  font-size: 1.0625rem;
  line-height: 1.75;
  color: #262626;
}
.blog-body :deep(h1),
.blog-body :deep(h2),
.blog-body :deep(h3),
.blog-body :deep(h4) {
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  color: #0a0a0a;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 2rem 0 0.75rem;
}
.blog-body :deep(h1) { font-size: 1.875rem; }
.blog-body :deep(h2) { font-size: 1.5rem; }
.blog-body :deep(h3) { font-size: 1.25rem; }
.blog-body :deep(h4) { font-size: 1.125rem; }
.blog-body :deep(p),
.blog-body :deep(ul),
.blog-body :deep(ol),
.blog-body :deep(blockquote),
.blog-body :deep(pre),
.blog-body :deep(table) {
  margin: 0 0 1.1rem 0;
}
.blog-body :deep(ul),
.blog-body :deep(ol) {
  padding-left: 1.5rem;
}
.blog-body :deep(li) {
  margin: 0.4rem 0;
}
.blog-body :deep(a) {
  color: #0a0a0a;
  text-decoration: underline;
  text-decoration-color: #d4d4d4;
  text-underline-offset: 0.2em;
  transition: text-decoration-color 0.15s ease;
}
.blog-body :deep(a:hover) {
  text-decoration-color: #737373;
}
.blog-body :deep(strong) { font-weight: 600; color: #0a0a0a; }
.blog-body :deep(em) { font-style: italic; }
.blog-body :deep(blockquote) {
  border-left: 3px solid #d4d4d4;
  padding-left: 1rem;
  color: #525252;
  font-style: italic;
}
.blog-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: #f5f5f5;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  border: 1px solid #e5e5e5;
}
.blog-body :deep(pre) {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.55;
}
.blog-body :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}
.blog-body :deep(hr) {
  border: 0;
  border-top: 1px solid #e5e5e5;
  margin: 2rem 0;
}
.blog-body :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5rem 0;
  border-radius: 6px;
}
.blog-body :deep(table) {
  border-collapse: collapse;
  font-size: 0.95rem;
  width: 100%;
}
.blog-body :deep(th),
.blog-body :deep(td) {
  border: 1px solid #e5e5e5;
  padding: 0.5rem 0.7rem;
  text-align: left;
}
.blog-body :deep(thead th) {
  background: #fafafa;
  font-weight: 600;
  color: #0a0a0a;
}
</style>
