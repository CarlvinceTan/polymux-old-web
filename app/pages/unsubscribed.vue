<script setup lang="ts">
// Landing for the visible "Unsubscribe" footer link in newsletter emails.
// The page POSTs to /api/mailing-list/unsubscribe on mount so email-scanner
// prefetches (which fetch the link but don't execute JS) can't accidentally
// unsubscribe legitimate users.

const route = useRoute()
const { t } = useI18n()

definePageMeta({ layout: 'landing' })

const token = computed(() => String(route.query.token ?? ''))
const status = ref<'pending' | 'success' | 'invalid' | 'error'>('pending')
const email = ref<string | null>(null)
const resubLoading = ref(false)
const resubError = ref<string | null>(null)

onMounted(async () => {
  if (!token.value) {
    status.value = 'invalid'
    return
  }
  try {
    const res = await $fetch<{ ok: true; email: string }>(
      '/api/mailing-list/unsubscribe',
      { method: 'POST', query: { token: token.value } },
    )
    email.value = res.email
    status.value = 'success'
  }
  catch (err) {
    const e = err as { statusCode?: number }
    status.value = e?.statusCode === 400 ? 'invalid' : 'error'
  }
})

async function resubscribe() {
  if (!email.value) return
  resubLoading.value = true
  resubError.value = null
  try {
    await $fetch('/api/mailing-list/subscribe', {
      method: 'POST',
      body: { email: email.value },
    })
    // Subscribe is verification-gated — send the user to the blog landing
    // where the BlogSubscribeWidget surfaces the "check your email" UX.
    await navigateTo('/blog#blog-newsletter')
  }
  catch (err) {
    const e = err as { data?: { message?: string } }
    resubError.value = e?.data?.message ?? t('unsubscribe.errorBody')
  }
  finally {
    resubLoading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
    <div v-if="status === 'pending'" class="text-sm text-neutral-500">
      {{ t('unsubscribe.processing') }}
    </div>

    <template v-else-if="status === 'success'">
      <UIcon name="i-heroicons-check-circle-20-solid" class="size-12 text-green-600" />
      <h1 class="mt-4 text-2xl font-semibold tracking-tight text-neutral-950">
        {{ t('unsubscribe.successTitle') }}
      </h1>
      <p class="mt-2 text-sm text-neutral-600">
        {{ t('unsubscribe.successBody', { email }) }}
      </p>
      <p v-if="resubError" class="mt-3 text-sm text-red-600" role="alert">
        {{ resubError }}
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          :disabled="resubLoading"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          @click="resubscribe"
        >
          {{ resubLoading ? t('unsubscribe.resubscribing') : t('unsubscribe.resubscribe') }}
        </button>
        <NuxtLink
          to="/"
          class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {{ t('unsubscribe.home') }}
        </NuxtLink>
      </div>
    </template>

    <template v-else-if="status === 'invalid'">
      <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-12 text-amber-500" />
      <h1 class="mt-4 text-2xl font-semibold tracking-tight text-neutral-950">
        {{ t('unsubscribe.invalidTitle') }}
      </h1>
      <p class="mt-2 text-sm text-neutral-600">{{ t('unsubscribe.invalidBody') }}</p>
    </template>

    <template v-else>
      <UIcon name="i-heroicons-exclamation-circle-20-solid" class="size-12 text-red-500" />
      <h1 class="mt-4 text-2xl font-semibold tracking-tight text-neutral-950">
        {{ t('unsubscribe.errorTitle') }}
      </h1>
      <p class="mt-2 text-sm text-neutral-600">{{ t('unsubscribe.errorBody') }}</p>
    </template>
  </div>
</template>
