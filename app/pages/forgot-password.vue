<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('auth.forgotPasswordTitle')}`,
})

const supabase = useSupabaseClient()

const email = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const sent = ref(false)

async function onSubmit() {
  if (!import.meta.client) return
  error.value = null
  pending.value = true
  try {
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.value.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    )
    if (authError) {
      error.value = authError.message
    }
    else {
      sent.value = true
    }
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-neutral-50">
    <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:py-6 md:py-10">
      <div class="w-full max-w-md">
        <div
          class="rounded-2xl border border-neutral-200/90 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
        >
          <div class="mb-2 flex w-full justify-center">
            <NuxtLink
              to="/"
              class="inline-flex rounded-md text-neutral-950 outline-none ring-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2"
              :aria-label="t('auth.polymuxHome')"
            >
              <PolymuxLogo class="size-12 shrink-0 sm:size-14" />
            </NuxtLink>
          </div>

          <h1 class="text-center text-[1.25rem] font-semibold tracking-tight text-neutral-950 sm:text-[1.375rem]">
            {{ t('auth.forgotPasswordTitle') }}
          </h1>
          <p class="mt-1 text-center text-[0.8125rem] text-neutral-500 sm:text-sm">
            {{ t('auth.forgotPasswordDesc') }}
          </p>

            <div
              v-if="sent"
              class="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 sm:mt-5 sm:py-4"
              role="status"
            >
              <p class="font-medium text-neutral-950">
                {{ t('auth.sendResetLink') }}
              </p>
              <p class="mt-1">
                {{ t('auth.resetLinkSent') }}
              </p>
            </div>

            <form
              v-else
              class="mt-3.5 flex w-full flex-col gap-2.5 sm:mt-4 sm:gap-3"
              novalidate
              @submit.prevent="onSubmit"
            >
              <div>
                <label
                  for="forgot-email"
                  class="block text-sm font-medium text-neutral-800"
                >{{ t('common.email') }}</label>
                <input
                  id="forgot-email"
                  v-model="email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  :placeholder="t('auth.emailPlaceholder')"
                  class="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                >
              </div>
              <p
                v-if="error"
                class="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700"
                role="alert"
              >
                {{ error }}
              </p>
              <button
                type="submit"
                :disabled="pending"
                class="h-10 w-full rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {{ pending ? t('auth.sendingResetLink') : t('auth.sendResetLink') }}
              </button>
            </form>

            <p class="mt-4 text-center text-[0.8125rem] text-neutral-500 sm:mt-5 sm:text-sm">
              <NuxtLink
                to="/sign-in"
                class="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2 transition-colors hover:opacity-80"
              >
                {{ t('auth.backToSignIn') }}
              </NuxtLink>
            </p>
        </div>
      </div>
    </div>
    <AuthTermsFooter />
  </div>
</template>