<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('blog.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('blog.metaDescription'),
    },
  ],
})

const route = useRoute()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const { settings, fetchSettings } = useUserSettings()

interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string | null
  accent: string
  cover_image_url: string | null
  published_at: string
}

// Fetch live posts (published_at not null, not in the future). The RLS
// policy on public.blog_posts also enforces this for anon callers, but we
// add an explicit filter so we don't need to re-sort/clip on the client.
const { data: postsData } = await useAsyncData<BlogPost[]>('blog-posts', async () => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, category, accent, cover_image_url, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
  if (error) {
    console.error('[blog] fetch error:', error)
    return []
  }
  return (data ?? []) as BlogPost[]
})

const posts = computed<BlogPost[]>(() => postsData.value ?? [])

onMounted(async () => {
  if (user.value) {
    await fetchSettings(true)
  }
})

const signInForSubscribe = computed(() => ({
  path: '/sign-in',
  query: { redirect: route.fullPath },
}))

function scrollToNewsletterBlock() {
  if (!import.meta.client) return
  document.getElementById('blog-newsletter')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const ACCENT_CLASSES: Record<string, string> = {
  slate: 'from-slate-200 to-slate-100',
  zinc: 'from-zinc-200 to-zinc-100',
  stone: 'from-stone-200 to-stone-100',
}

function accentClass(accent: string): string {
  return ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.slate!
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[680px]">
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          {{ t('blog.title') }}
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ t('blog.subtitle') }}
        </p>
        <p v-if="!settings.blog_newsletter_subscribed" class="mt-6 text-sm text-neutral-500">
          {{ t('blog.subscribeHint') }} &middot;
          <NuxtLink
            v-if="!user"
            :to="signInForSubscribe"
            class="underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-800"
          >
            {{ t('blog.subscribe') }}
          </NuxtLink>
          <button
            v-else
            type="button"
            class="cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-800"
            @click="scrollToNewsletterBlock"
          >
            {{ t('blog.subscribe') }}
          </button>
        </p>
      </header>

      <hr class="my-12 border-neutral-200 sm:border-neutral-200/[.85]" />

      <div v-if="posts.length === 0" class="py-16 text-center text-[0.9375rem] text-neutral-500">
        {{ t('blog.empty') }}
      </div>

      <div v-else class="flex flex-col gap-0">
        <article
          v-for="post in posts"
          :key="post.id"
          class="group border-b border-neutral-200 py-10 first:pt-0 last:border-b-0"
        >
          <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-neutral-500">
                <time :datetime="post.published_at">{{ dateLabel(post.published_at) }}</time>
                <template v-if="post.category">
                  <span aria-hidden="true" class="text-neutral-300">&middot;</span>
                  <span>{{ post.category }}</span>
                </template>
              </div>
              <h2 class="mt-3 text-xl font-semibold leading-snug tracking-tight text-neutral-950 sm:text-[1.375rem]">
                <NuxtLink
                  :to="`/blog/${post.slug}`"
                  class="transition-colors hover:text-neutral-700"
                >
                  {{ post.title }}
                </NuxtLink>
              </h2>
              <p v-if="post.excerpt" class="mt-3 text-[0.9375rem] leading-relaxed text-neutral-600">
                {{ post.excerpt }}
              </p>
              <NuxtLink
                :to="`/blog/${post.slug}`"
                class="mt-4 inline-flex items-center text-sm font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-[0.2em] transition-colors hover:decoration-neutral-500"
              >
                {{ t('blog.readMore') }}
              </NuxtLink>
            </div>
            <NuxtLink
              :to="`/blog/${post.slug}`"
              class="block aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg bg-gradient-to-br sm:aspect-square sm:w-40 sm:max-w-[40%] lg:w-44"
              :class="accentClass(post.accent)"
              :aria-label="post.title"
            >
              <img
                v-if="post.cover_image_url"
                :src="post.cover_image_url"
                :alt="post.title"
                class="h-full w-full object-cover"
              />
            </NuxtLink>
          </div>
        </article>
      </div>

      <BlogSubscribeWidget v-if="!settings.blog_newsletter_subscribed" />
    </div>
  </div>
</template>
