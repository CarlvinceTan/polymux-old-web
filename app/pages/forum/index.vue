<script setup lang="ts">
import {
  FORUM_CATEGORY_META,
  FORUM_TONE_CLASS,
  forumCategoryBySlug,
  formatForumViews,
  type ForumDiscussionSummary,
} from '~/types/forum'

definePageMeta({ layout: 'landing' })

useHead({ title: 'Forum — Polymux' })

const user = useSupabaseUser()
const route = useRoute()
const { relativeTime } = useRelativeTime()

type Sort = 'latest' | 'top' | 'unanswered'

const activeCategory = ref<'all' | string>('all')
const sort = ref<Sort>('latest')
const search = ref('')

const queryParams = computed(() => ({
  category: activeCategory.value === 'all' ? '' : activeCategory.value,
  sort: sort.value,
  search: search.value.trim(),
}))

const { data, pending, error, refresh } = await useAsyncData<{
  discussions: ForumDiscussionSummary[]
}>(
  'forum-discussions',
  () => $fetch('/api/forum/discussions', { query: queryParams.value }),
  { watch: [queryParams], default: () => ({ discussions: [] }) },
)

const discussions = computed<ForumDiscussionSummary[]>(() => data.value?.discussions ?? [])

const startDiscussionTarget = computed(() =>
  user.value
    ? '/forum/new'
    : { path: '/sign-in', query: { redirect: '/forum/new' } },
)

const guidelineCards = [
  {
    icon: 'i-heroicons-magnifying-glass-20-solid',
    title: 'Search before you post',
    description:
      'Chances are someone already hit the same wall. A quick search often answers your question in seconds.',
  },
  {
    icon: 'i-heroicons-tag-20-solid',
    title: 'Pick the right category',
    description:
      'Accurate categories put your post in front of the people most likely to help. Mods nudge posts that land in the wrong spot.',
  },
  {
    icon: 'i-heroicons-hand-raised-20-solid',
    title: 'Be kind, be specific',
    description:
      'Describe what you tried, what you expected, and what happened. Screenshots and snippets go a long way.',
  },
]

function clearFilters() {
  activeCategory.value = 'all'
  search.value = ''
  sort.value = 'latest'
}

const hasActiveFilters = computed(
  () => activeCategory.value !== 'all' || search.value.trim() !== '' || sort.value !== 'latest',
)
</script>

<template>
  <FeatureGate name="forum">
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-5xl">
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          Polymux Forum
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          Ask questions, share workflows, and connect with other teams building on Polymux.
        </p>

        <div class="mx-auto mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
          <NuxtLink
            :to="startDiscussionTarget"
            class="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <UIcon name="i-heroicons-pencil-square-20-solid" class="size-4" />
            Start a discussion
          </NuxtLink>
          <a
            href="#guidelines"
            class="text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900"
          >
            Read the guidelines
          </a>
        </div>

        <div class="mx-auto mt-10 max-w-[560px]">
          <div class="relative">
            <input
              v-model="search"
              type="text"
              placeholder="Search discussions..."
              class="w-full rounded-lg border border-neutral-200 bg-white py-3 pl-[3.75rem] pr-4 text-base text-neutral-950 placeholder-neutral-500 transition-colors focus:border-neutral-300 focus:outline-none"
            >
            <UIcon
              name="i-heroicons-magnifying-glass-20-solid"
              class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-neutral-400"
            />
          </div>
        </div>
      </header>

      <hr class="my-12 border-neutral-200 sm:border-neutral-200/[.85]" />

      <section aria-label="Browse categories">
        <div class="flex items-baseline justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Browse by category
          </h2>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            @click="clearFilters"
          >
            Reset filters
          </button>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            :class="[
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              activeCategory === 'all'
                ? 'border-neutral-950 bg-neutral-950 text-white'
                : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
            ]"
            @click="activeCategory = 'all'"
          >
            All posts
          </button>
          <button
            v-for="cat in FORUM_CATEGORY_META"
            :key="cat.slug"
            type="button"
            :class="[
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              activeCategory === cat.slug
                ? 'border-neutral-950 bg-neutral-950 text-white'
                : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
            ]"
            @click="activeCategory = cat.slug"
          >
            <UIcon
              :name="cat.icon"
              class="size-4 shrink-0"
              :class="activeCategory === cat.slug ? 'text-white' : 'text-neutral-500'"
            />
            {{ cat.label }}
          </button>
        </div>
      </section>

      <div class="mt-10 flex flex-col gap-3 border-b border-neutral-200 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex items-center gap-1 overflow-x-auto">
          <button
            v-for="tab in ([
              { id: 'latest', label: 'Latest' },
              { id: 'top', label: 'Top' },
              { id: 'unanswered', label: 'Unanswered' },
            ] as const)"
            :key="tab.id"
            type="button"
            :class="[
              'relative px-3 pb-3 pt-1 text-sm font-medium transition-colors',
              sort === tab.id
                ? 'text-neutral-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                : 'text-neutral-500 hover:text-neutral-800',
            ]"
            @click="sort = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <p class="pb-3 text-xs text-neutral-500">
          <template v-if="pending">Loading…</template>
          <template v-else-if="error">Unable to load discussions</template>
          <template v-else>
            {{ discussions.length }} discussion<template v-if="discussions.length !== 1">s</template>
          </template>
        </p>
      </div>

      <div class="flex flex-col">
        <div v-if="pending && !discussions.length" class="py-16 text-center text-sm text-neutral-500">
          Loading discussions…
        </div>

        <div
          v-else-if="error"
          class="border-b border-neutral-200 py-16 text-center"
        >
          <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="mx-auto size-8 text-neutral-400" />
          <p class="mt-3 text-sm text-neutral-700">
            Couldn't load the forum. The database may still be warming up.
          </p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            @click="refresh()"
          >
            <UIcon name="i-heroicons-arrow-path-20-solid" class="size-4" />
            Retry
          </button>
        </div>

        <template v-else>
          <article
            v-for="d in discussions"
            :key="d.id"
            class="group border-b border-neutral-200 py-6 first:pt-6 last:border-b-0"
          >
            <NuxtLink :to="`/forum/${d.id}`" class="flex gap-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white"
                :aria-label="`Started by ${d.author_name}`"
              >
                {{ d.author_initials }}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    v-if="d.pinned"
                    class="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-white"
                  >
                    <UIcon name="i-heroicons-bookmark-20-solid" class="size-3" />
                    Pinned
                  </span>
                  <span
                    v-if="forumCategoryBySlug(d.category)"
                    :class="[
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                      FORUM_TONE_CLASS[forumCategoryBySlug(d.category)!.tone],
                    ]"
                  >
                    <UIcon :name="forumCategoryBySlug(d.category)!.icon" class="size-3" />
                    {{ forumCategoryBySlug(d.category)!.label }}
                  </span>
                  <span
                    v-if="d.answered"
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-emerald-700"
                  >
                    <UIcon name="i-heroicons-check-circle-20-solid" class="size-3.5" />
                    Answered
                  </span>
                </div>

                <h3 class="mt-2 text-[1.0625rem] font-semibold leading-snug tracking-tight text-neutral-950 sm:text-[1.125rem]">
                  <span class="transition-colors group-hover:text-neutral-700">
                    {{ d.title }}
                  </span>
                </h3>
                <p class="mt-1.5 line-clamp-2 text-sm leading-relaxed text-neutral-600">
                  {{ d.body }}
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                  <span class="font-medium text-neutral-700">{{ d.author_name }}</span>
                  <span aria-hidden="true" class="text-neutral-300">&middot;</span>
                  <time :datetime="d.last_activity_at">{{ relativeTime(d.last_activity_at) }}</time>
                  <span class="sm:hidden">
                    <span aria-hidden="true" class="text-neutral-300">&middot;</span>
                    {{ d.reply_count }} repl<template v-if="d.reply_count !== 1">ies</template><template v-else>y</template>
                  </span>
                </div>
              </div>

              <div class="hidden shrink-0 flex-col items-end justify-center gap-1.5 text-right sm:flex">
                <div class="inline-flex items-center gap-1.5 text-sm text-neutral-700">
                  <UIcon name="i-heroicons-chat-bubble-left-20-solid" class="size-4 text-neutral-400" />
                  <span class="font-medium tabular-nums">{{ d.reply_count }}</span>
                </div>
                <div class="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <UIcon name="i-heroicons-eye-20-solid" class="size-4 text-neutral-400" />
                  <span class="tabular-nums">{{ formatForumViews(d.views) }}</span>
                </div>
              </div>
            </NuxtLink>
          </article>

          <div
            v-if="!discussions.length"
            class="flex flex-col items-center border-b border-neutral-200 py-16 text-center"
          >
            <UIcon name="i-heroicons-inbox-20-solid" class="size-8 text-neutral-300" />
            <p class="mt-3 text-sm text-neutral-600">
              <template v-if="hasActiveFilters">No discussions match your filters.</template>
              <template v-else>No discussions yet. Be the first to start one.</template>
            </p>
            <div class="mt-4 flex gap-3">
              <button
                v-if="hasActiveFilters"
                type="button"
                class="text-sm font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2 transition-colors hover:decoration-neutral-500"
                @click="clearFilters"
              >
                Clear filters
              </button>
              <NuxtLink
                v-else
                :to="startDiscussionTarget"
                class="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <UIcon name="i-heroicons-pencil-square-20-solid" class="size-4" />
                Start a discussion
              </NuxtLink>
            </div>
          </div>
        </template>
      </div>

      <section id="guidelines" class="mt-24 scroll-mt-24">
        <div class="text-center">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            New here?
          </span>
          <h2 class="mt-3 font-serif text-3xl tracking-tight text-neutral-950 sm:text-4xl">
            Before you post
          </h2>
          <p class="mx-auto mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-neutral-600">
            A few minutes of context means faster, friendlier answers from the community.
          </p>
        </div>
        <div class="mt-10 grid gap-5 sm:grid-cols-3">
          <div
            v-for="card in guidelineCards"
            :key="card.title"
            class="rounded-xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-sm"
          >
            <div class="flex size-9 items-center justify-center rounded-lg bg-neutral-100">
              <UIcon :name="card.icon" class="size-5 text-neutral-700" />
            </div>
            <h3 class="mt-4 text-base font-semibold tracking-tight text-neutral-950">
              {{ card.title }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-neutral-600">
              {{ card.description }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
  </FeatureGate>
</template>
