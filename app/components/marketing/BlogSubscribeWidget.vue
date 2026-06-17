<script setup lang="ts">
const { t } = useI18n()
const user = useSupabaseUser()
const { email, loading, error, isSubscribed, showSuccessMessage, subscribe, reset } = useMailingList()
const { settings, saving: settingsSaving, saveSettings } = useUserSettings()

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  await subscribe(email.value)
}

onMounted(() => {
  reset()
})

async function toggleBlogSubscription() {
  await saveSettings({ blog_newsletter_subscribed: !settings.value.blog_newsletter_subscribed })
}
</script>

<template>
  <div
    id="blog-newsletter"
    class="mt-16 scroll-mt-24 rounded-xl border border-neutral-200 bg-neutral-50/80 px-6 py-10"
    :class="user ? '' : 'text-center'"
  >
    <div
      :class="
        user
          ? 'flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8'
          : ''
      "
    >
      <div :class="user ? 'min-w-0 flex-1 text-left' : ''">
        <h2 class="font-serif text-2xl tracking-tight text-neutral-950">
          {{ t('blog.newsletterHeading') }}
        </h2>
        <p
          class="mt-2 text-sm leading-relaxed text-neutral-600"
          :class="user ? 'max-w-lg' : 'mx-auto max-w-md'"
        >
          {{ t('blog.newsletterBody') }}
        </p>
        <p
          v-if="error"
          class="mt-4 text-sm text-red-600"
          :class="user ? 'max-w-lg' : 'mx-auto max-w-md'"
          role="alert"
        >
          {{ error }}
        </p>
        <p
          v-if="showSuccessMessage && isSubscribed"
          class="mt-4 text-sm text-green-600"
          :class="user ? 'max-w-lg' : 'mx-auto max-w-md'"
          role="status"
        >
          {{ t('blog.verifyEmailPrompt') }}
        </p>
      </div>

      <!-- Guest form -->
      <form
        v-if="!user"
        class="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:items-stretch"
        @submit="handleSubmit"
      >
        <label class="sr-only" for="blog-newsletter-email">{{ t('blog.emailLabel') }}</label>
        <input
          id="blog-newsletter-email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          :placeholder="t('contact.emailPlaceholder')"
          :disabled="loading || isSubscribed"
          class="min-h-11 w-full flex-1 rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none ring-neutral-950 transition-[box-shadow,border-color] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 disabled:bg-neutral-100 disabled:opacity-60"
        >
        <button
          type="submit"
          :disabled="loading || isSubscribed"
          :class="{
            'bg-neutral-950 text-white hover:opacity-90': !isSubscribed,
            'bg-neutral-300 text-neutral-600 cursor-not-allowed': isSubscribed,
          }"
          class="min-h-11 shrink-0 rounded-lg px-6 text-sm font-medium transition-opacity disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <Icon v-if="loading" name="eos-icons:loading" />
          <Icon v-else-if="isSubscribed" name="heroicons:check-20-solid" />
          <span>
            {{ loading ? t('blog.subscribing') : isSubscribed ? t('blog.subscribed') : t('blog.subscribe') }}
          </span>
        </button>
      </form>

      <!-- Signed-in user state -->
      <div
        v-if="user"
        class="mt-6 text-center sm:mt-0 sm:text-right"
      >
        <button
          type="button"
          :disabled="settingsSaving"
          class="min-h-11 shrink-0 rounded-lg bg-neutral-950 px-8 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          @click="toggleBlogSubscription"
        >
          {{ settingsSaving ? '...' : t('blog.subscribe') }}
        </button>
      </div>
    </div>
  </div>
</template>
