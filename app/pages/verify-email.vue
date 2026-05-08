<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `Verify Email`,
})

const route = useRoute()
const token = route.query.token as string | undefined
const loading = ref(true)
const verified = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!token) {
    error.value = 'Verification token is missing'
    loading.value = false
    return
  }

  try {
    const result = await $fetch('/api/mailing-list/verify', {
      query: { token },
    })
    verified.value = true
  }
  catch (err: unknown) {
    if (err instanceof Error) {
      error.value = err.message
    }
    else if (typeof err === 'object' && err !== null && 'data' in err) {
      const errorData = err as any
      error.value = errorData.data?.message || 'Failed to verify email'
    }
    else {
      error.value = 'Failed to verify email'
    }
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="relative grid h-dvh grid-rows-[minmax(0,1fr)_auto] bg-neutral-50">
    <div class="min-h-0 overflow-y-auto px-4">
      <div class="mx-auto flex min-h-full w-full max-w-sm flex-col">
        <div class="my-auto py-10 sm:py-12">
          <div
            class="rounded-2xl border border-neutral-200/90 bg-white px-6 py-10 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-8 sm:py-12"
          >
            <div class="mb-6 flex w-full justify-center">
              <NuxtLink
                to="/"
                class="inline-flex rounded-md text-neutral-950 outline-none ring-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2"
                :aria-label="t('auth.polymuxHome')"
              >
                <PolymuxLogo class="size-16 shrink-0 sm:size-20" />
              </NuxtLink>
            </div>

            <div v-if="loading" class="flex flex-col items-center gap-4 py-8">
              <div class="size-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-950" />
              <p class="text-sm text-neutral-500">
                Verifying your email...
              </p>
            </div>

            <div v-else-if="verified" class="flex flex-col items-center gap-4">
              <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Icon name="heroicons:check-20-solid" class="h-8 w-8 text-green-600" />
              </div>
              <h1 class="text-center text-2xl font-semibold tracking-tight text-neutral-950">
                Email verified!
              </h1>
              <p class="text-center text-sm text-neutral-600">
                Your subscription to the Polymux Blog has been confirmed. Welcome! 🎉
              </p>
              <div class="mt-4 w-full">
                <NuxtLink
                  to="/blog"
                  class="flex h-10 w-full items-center justify-center rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Back to blog
                </NuxtLink>
              </div>
            </div>

            <div v-else class="flex flex-col items-center gap-4">
              <div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <Icon name="heroicons:x-mark-20-solid" class="h-8 w-8 text-red-600" />
              </div>
              <h1 class="text-center text-2xl font-semibold tracking-tight text-neutral-950">
                Verification failed
              </h1>
              <p class="text-center text-sm text-red-600">
                {{ error }}
              </p>
              <div class="mt-4 w-full">
                <NuxtLink
                  to="/blog"
                  class="flex h-10 w-full items-center justify-center rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Back to blog
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="h-8 sm:h-12" /> <!-- Spacer since verify-email doesn't have the standard footer -->
  </div>
</template>