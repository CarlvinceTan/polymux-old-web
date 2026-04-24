<script setup lang="ts">
definePageMeta({ layout: 'landing' })

const route = useRoute()
const user = useSupabaseUser()
const { settings, saving: settingsSaving, fetchSettings } = useUserSettings()

// Force a fresh fetch each time this page is visited so the UI always reflects
// the authoritative Supabase value (e.g. if toggled in settings since last load).
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

interface BlogPost {
  slug: string
  title: string
  excerpt: string
  date: string
  dateLabel: string
  category?: string
  /** Accent for thumbnail placeholder */
  accent: 'slate' | 'zinc' | 'stone'
}

const posts: BlogPost[] = [
  {
    slug: 'introducing-polymux-agents',
    title: 'Introducing multi-agent orchestration in Polymux',
    excerpt:
      'How we think about reliable coordination, isolated browser sessions, and observability when you run more than one agent at a time.',
    date: '2026-03-18',
    dateLabel: 'Mar 18',
    category: 'Product',
    accent: 'slate',
  },
  {
    slug: 'vault-security-model',
    title: 'How the Polymux Vault keeps secrets out of prompts',
    excerpt:
      'A short tour of encryption boundaries, scoped access for agents, and what gets logged when credentials are used.',
    date: '2026-03-04',
    dateLabel: 'Mar 4',
    category: 'Security',
    accent: 'zinc',
  },
  {
    slug: 'marketplace-rollout',
    title: 'Publishing workflows to the marketplace',
    excerpt:
      'Packaging agents, versioning bundles, and what reviewers look for before a listing goes live.',
    date: '2026-02-19',
    dateLabel: 'Feb 19',
    category: 'Platform',
    accent: 'stone',
  },
]

const accentClass: Record<BlogPost['accent'], string> = {
  slate: 'from-slate-200 to-slate-100',
  zinc: 'from-zinc-200 to-zinc-100',
  stone: 'from-stone-200 to-stone-100',
}


</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[680px]">
      <!-- Publication masthead (Substack-style, no external header) -->
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          Polymux Blog
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          Product updates, engineering notes, and guides for teams building with Polymux
          &mdash; orchestrate agents, watch live browser sessions, and ship automations
          you can trust.
        </p>
        <p v-if="!settings.blog_newsletter_subscribed" class="mt-6 text-sm text-neutral-500">
          New posts a few times a month &middot;
          <NuxtLink
            v-if="!user"
            :to="signInForSubscribe"
            class="underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-800"
          >
            Subscribe
          </NuxtLink>
          <button
            v-else
            type="button"
            class="cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-800"
            @click="scrollToNewsletterBlock"
          >
            Subscribe
          </button>
        </p>
      </header>

      <hr class="my-12 border-neutral-200 sm:border-neutral-200/[.85]" />

      <!-- Post feed -->
      <div class="flex flex-col gap-0">
        <article
          v-for="post in posts"
          :key="post.slug"
          class="group border-b border-neutral-200 py-10 first:pt-0 last:border-b-0"
        >
          <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-neutral-500">
                <time :datetime="post.date">{{ post.dateLabel }}</time>
                <template v-if="post.category">
                  <span aria-hidden="true" class="text-neutral-300">&middot;</span>
                  <span>{{ post.category }}</span>
                </template>
              </div>
              <h2 class="mt-3 text-xl font-semibold leading-snug tracking-tight text-neutral-950 sm:text-[1.375rem]">
                <a
                  :href="`#${post.slug}`"
                  class="transition-colors hover:text-neutral-700"
                >
                  {{ post.title }}
                </a>
              </h2>
              <p class="mt-3 text-[0.9375rem] leading-relaxed text-neutral-600">
                {{ post.excerpt }}
              </p>
              <a
                :href="`#${post.slug}`"
                class="mt-4 inline-flex items-center text-sm font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-[0.2em] transition-colors hover:decoration-neutral-500"
              >
                Read more
              </a>
            </div>
            <div
              class="aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg bg-gradient-to-br sm:aspect-square sm:w-40 sm:max-w-[40%] lg:w-44"
              :class="accentClass[post.accent]"
              aria-hidden="true"
            />
          </div>
        </article>
      </div>

      <!-- Newsletter block (guest subscription widget) -->
      <BlogSubscribeWidget v-if="!settings.blog_newsletter_subscribed" />
    </div>
  </div>
</template>
