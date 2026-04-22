<script setup lang="ts">
import {
  FORUM_CATEGORY_META,
  type ForumCategorySlug,
  type ForumDiscussion,
} from '~/types/forum'

definePageMeta({ layout: 'landing' })

useHead({ title: 'Start a discussion — Polymux Forum' })

const user = useSupabaseUser()
const route = useRoute()
const router = useRouter()

const redirectTarget = '/forum/new'

watchEffect(() => {
  if (import.meta.server) return
  if (!user.value) {
    router.replace({ path: '/sign-in', query: { redirect: redirectTarget } })
  }
})

const title = ref('')
const body = ref('')
const category = ref<ForumCategorySlug | ''>('')
const submitting = ref(false)
const errorMessage = ref('')

const titleTrimmed = computed(() => title.value.trim())
const bodyTrimmed = computed(() => body.value.trim())

const canSubmit = computed(
  () =>
    !submitting.value
    && !!category.value
    && titleTrimmed.value.length >= 3 && titleTrimmed.value.length <= 200
    && bodyTrimmed.value.length >= 10 && bodyTrimmed.value.length <= 20000,
)

async function onSubmit() {
  if (!canSubmit.value) return
  errorMessage.value = ''
  submitting.value = true
  try {
    const res = await $fetch<{ discussion: ForumDiscussion }>('/api/forum/discussions', {
      method: 'POST',
      body: {
        category: category.value,
        title: titleTrimmed.value,
        body: bodyTrimmed.value,
      },
    })
    await router.replace(`/forum/${res.discussion.id}`)
  }
  catch (err) {
    const anyErr = err as { statusMessage?: string; data?: { statusMessage?: string }, message?: string }
    errorMessage.value
      = anyErr?.data?.statusMessage
        || anyErr?.statusMessage
        || anyErr?.message
        || 'Something went wrong. Please try again.'
    submitting.value = false
  }
}

function goBack() {
  if (!import.meta.client) return
  if (window.history.length > 1) router.back()
  else navigateTo('/forum')
}
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-[720px]">
      <header>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
          @click="goBack"
        >
          <UIcon name="i-heroicons-arrow-left-20-solid" class="size-4" />
          Back to forum
        </button>
        <h1 class="mt-4 font-serif text-[2.25rem] leading-[1.1] tracking-tight text-neutral-950 sm:text-4xl">
          Start a discussion
        </h1>
        <p class="mt-3 text-[0.9375rem] leading-relaxed text-neutral-600">
          Share a question, show what you shipped, or kick off a conversation with other teams using Polymux.
        </p>
      </header>

      <form class="mt-10 space-y-6" novalidate @submit.prevent="onSubmit">
        <fieldset>
          <legend class="block text-sm font-medium text-neutral-800">
            Category
          </legend>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label
              v-for="cat in FORUM_CATEGORY_META"
              :key="cat.slug"
              :class="[
                'group relative flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors',
                category === cat.slug
                  ? 'border-neutral-950 bg-neutral-50'
                  : 'border-neutral-200 bg-white hover:border-neutral-300',
              ]"
            >
              <input
                v-model="category"
                type="radio"
                name="category"
                :value="cat.slug"
                class="sr-only"
              >
              <UIcon
                :name="cat.icon"
                class="mt-0.5 size-4 shrink-0"
                :class="category === cat.slug ? 'text-neutral-950' : 'text-neutral-500'"
              />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-neutral-950">{{ cat.label }}</span>
                <span class="mt-0.5 block text-xs leading-snug text-neutral-500">{{ cat.description }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div>
          <label for="forum-title" class="block text-sm font-medium text-neutral-800">
            Title
          </label>
          <input
            id="forum-title"
            v-model="title"
            type="text"
            name="title"
            autocomplete="off"
            maxlength="200"
            placeholder="What's this about?"
            class="mt-2 min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base text-neutral-950 placeholder-neutral-500 transition-colors focus:border-neutral-300 focus:outline-none"
            :disabled="submitting"
          >
          <p class="mt-1.5 text-xs text-neutral-500">
            {{ titleTrimmed.length }}/200 &middot; at least 3 characters
          </p>
        </div>

        <div>
          <label for="forum-body" class="block text-sm font-medium text-neutral-800">
            Body
          </label>
          <textarea
            id="forum-body"
            v-model="body"
            name="body"
            rows="10"
            maxlength="20000"
            placeholder="Describe what you tried, what you expected, and what happened. Snippets and screenshots go a long way."
            class="mt-2 min-h-[12rem] w-full resize-y rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base leading-relaxed text-neutral-950 placeholder-neutral-500 transition-colors focus:border-neutral-300 focus:outline-none"
            :disabled="submitting"
          />
          <p class="mt-1.5 text-xs text-neutral-500">
            {{ bodyTrimmed.length }}/20,000 &middot; at least 10 characters
          </p>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600" role="alert">
          {{ errorMessage }}
        </p>

        <div class="flex items-center justify-between gap-3 border-t border-neutral-200 pt-6">
          <p class="text-xs text-neutral-500">
            Posting as <span class="font-medium text-neutral-700">{{ user?.email ?? 'you' }}</span>
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="inline-flex min-h-10 items-center rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
              :disabled="submitting"
              @click="goBack"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmit"
            >
              {{ submitting ? 'Publishing…' : 'Publish discussion' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
