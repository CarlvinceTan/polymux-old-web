<script setup lang="ts">
import {
  FORUM_TONE_CLASS,
  forumCategoryBySlug,
  formatForumViews,
  type ForumDiscussion,
  type ForumReply,
} from '~/types/forum'

definePageMeta({ layout: 'landing' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const { relativeTime } = useRelativeTime()

const id = computed(() => String(route.params.id ?? ''))

type DiscussionResponse = { discussion: ForumDiscussion; replies: ForumReply[] }

const { data, pending, error, refresh } = await useAsyncData<DiscussionResponse>(
  () => `forum-discussion-${id.value}`,
  () => apiFetch<DiscussionResponse>(`/api/forum/discussions/${id.value}`),
  { watch: [id] },
)

const discussion = computed<ForumDiscussion | null>(() => data.value?.discussion ?? null)
const replies = computed<ForumReply[]>(() => data.value?.replies ?? [])

useHead({ title: t('forum.pageTitle') })

const category = computed(() =>
  discussion.value ? forumCategoryBySlug(discussion.value.category) : undefined,
)

const replyBody = ref('')
const replySubmitting = ref(false)
const replyError = ref('')

const signInRedirect = computed(() => ({
  path: '/sign-in',
  query: { redirect: route.fullPath },
}))

async function submitReply() {
  const content = replyBody.value.trim()
  if (!content || !discussion.value) return
  if (content.length > 20000) {
    replyError.value = t('forum.replyTooLong')
    return
  }
  replyError.value = ''
  replySubmitting.value = true
  try {
    await $fetch(`/api/forum/discussions/${discussion.value.id}/replies`, {
      method: 'POST',
      body: { body: content },
    })
    replyBody.value = ''
    await refresh()
    await nextTick()
    document.getElementById('forum-reply-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  catch (err) {
    const anyErr = err as { statusMessage?: string, data?: { statusMessage?: string }, message?: string }
    replyError.value
      = anyErr?.data?.statusMessage
        || anyErr?.statusMessage
        || anyErr?.message
        || t('forum.failedToPost')
  }
  finally {
    replySubmitting.value = false
  }
}

function goBack() {
  if (!import.meta.client) return
  if (window.history.length > 1) router.back()
  else navigateTo('/forum')
}
</script>

<template>
  <FeatureGate name="forum">
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[720px]">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
        @click="goBack"
      >
        <UIcon name="i-heroicons-arrow-left-20-solid" class="size-4" />
        {{ t('forum.backToForum') }}
      </button>

      <div v-if="pending && !discussion" class="mt-12 text-center text-sm text-neutral-500">
        {{ t('forum.loadingDiscussion') }}
      </div>

      <div v-else-if="error || !discussion" class="mt-12 rounded-xl border border-neutral-200 bg-white p-10 text-center">
        <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="mx-auto size-8 text-neutral-400" />
        <p class="mt-3 text-sm text-neutral-700">
          {{ t('forum.couldNotLoadDiscussion') }}
        </p>
        <NuxtLink
          to="/forum"
          class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2"
        >
          {{ t('forum.returnToForum') }}
        </NuxtLink>
      </div>

      <template v-else>
        <article class="mt-6 border-b border-neutral-200 pb-10">
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <span
              v-if="discussion.pinned"
              class="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-white"
            >
              <UIcon name="i-heroicons-bookmark-20-solid" class="size-3" />
              {{ t('forum.pinned') }}
            </span>
            <span
              v-if="category"
              :class="[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                FORUM_TONE_CLASS[category.tone],
              ]"
            >
              <UIcon :name="category.icon" class="size-3" />
              {{ t(`forum.categories.${category.slug}.label`) }}
            </span>
            <span
              v-if="discussion.answered"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-emerald-700"
            >
              <UIcon name="i-heroicons-check-circle-20-solid" class="size-3.5" />
              {{ t('forum.answered') }}
            </span>
          </div>

          <h1 class="mt-4 font-serif text-[2rem] leading-[1.12] tracking-tight text-neutral-950 sm:text-[2.25rem]">
            {{ discussion.title }}
          </h1>

          <div class="mt-5 flex items-center gap-3 border-y border-neutral-200 py-4">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {{ discussion.author_initials }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-neutral-900">
                {{ discussion.author_name }}
              </p>
              <p class="text-xs text-neutral-500">
                <time :datetime="discussion.created_at">{{ relativeTime(discussion.created_at) }}</time>
                <span aria-hidden="true" class="mx-2 text-neutral-300">&middot;</span>
                {{ discussion.views === 1 ? t('forum.viewCountOne') : t('forum.viewCountMany', { n: formatForumViews(discussion.views) }) }}
              </p>
            </div>
          </div>

          <div class="mt-6 whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-neutral-800">
            {{ discussion.body }}
          </div>
        </article>

        <section class="mt-10" :aria-label="t('forum.repliesAria')">
          <h2 class="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">
            {{ replies.length === 1 ? t('forum.replyCountOne') : t('forum.replyCountMany', { n: replies.length }) }}
          </h2>

          <div v-if="!replies.length" class="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-6 text-center text-sm text-neutral-600">
            {{ t('forum.noReplies') }}
          </div>

          <ol v-else class="mt-4 flex flex-col">
            <li
              v-for="r in replies"
              :key="r.id"
              class="border-b border-neutral-200 py-6 last:border-b-0"
            >
              <div class="flex gap-3">
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white"
                  aria-hidden="true"
                >
                  {{ r.author_initials }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span class="font-medium text-neutral-900">{{ r.author_name }}</span>
                    <time :datetime="r.created_at" class="text-xs text-neutral-500">
                      {{ relativeTime(r.created_at) }}
                    </time>
                  </div>
                  <div class="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-neutral-800">
                    {{ r.body }}
                  </div>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section id="forum-reply-anchor" class="mt-10 scroll-mt-24">
          <template v-if="user">
            <h2 class="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">
              {{ t('forum.yourReply') }}
            </h2>
            <form class="mt-3 space-y-3" novalidate @submit.prevent="submitReply">
              <textarea
                v-model="replyBody"
                name="forum-reply"
                rows="5"
                maxlength="20000"
                :placeholder="t('forum.replyPlaceholder')"
                class="w-full resize-y rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base leading-relaxed text-neutral-950 placeholder-neutral-500 transition-colors focus:border-neutral-300 focus:outline-none"
                :disabled="replySubmitting"
              />
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs text-neutral-500">
                  {{ t('forum.replyCounter', { count: replyBody.trim().length }) }}
                </p>
                <button
                  type="submit"
                  class="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="replySubmitting || !replyBody.trim().length"
                >
                  {{ replySubmitting ? t('forum.posting') : t('forum.postReply') }}
                </button>
              </div>
              <p v-if="replyError" class="text-sm text-red-600" role="alert">
                {{ replyError }}
              </p>
            </form>
          </template>

          <div
            v-else
            class="rounded-xl border border-neutral-200 bg-white p-6 text-center"
          >
            <UIcon name="i-heroicons-chat-bubble-left-right-20-solid" class="mx-auto size-7 text-neutral-400" />
            <p class="mt-3 text-sm text-neutral-700">
              {{ t('forum.signInToJoin') }}
            </p>
            <div class="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <NuxtLink
                :to="signInRedirect"
                class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {{ t('common.signIn') }}
              </NuxtLink>
              <NuxtLink
                :to="{ path: '/sign-up', query: { redirect: route.fullPath } }"
                class="text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900"
              >
                {{ t('forum.createAccount') }}
              </NuxtLink>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
  </FeatureGate>
</template>
