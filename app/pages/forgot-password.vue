<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('auth.forgotPasswordTitle')} — Polymux`,
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
  <div class="relative grid h-dvh grid-rows-[minmax(0,1fr)_auto] bg-neutral-50">
    <div class="min-h-0 overflow-y-auto px-4">
      <div class="mx-auto flex min-h-full w-full max-w-lg flex-col">
        <div class="my-auto py-10 sm:py-12">
          <div
            class="rounded-2xl border border-neutral-200/90 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-7 sm:py-7"
          >
            <div class="mb-2.5 flex w-full justify-center sm:mb-3">
              <NuxtLink
                to="/"
                class="inline-flex rounded-md text-neutral-950 outline-none ring-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2"
                :aria-label="t('auth.polymuxHome')"
              >
                <PolymuxLogo class="size-14 shrink-0 sm:size-18" />
              </NuxtLink>
            </div>

            <h1 class="text-center text-[1.375rem] font-semibold tracking-tight text-neutral-950 sm:text-2xl">
              {{ t('auth.forgotPasswordTitle') }}
            </h1>
            <p class="mt-1.5 text-center text-sm text-neutral-500 sm:mt-2">
              {{ t('auth.forgotPasswordDesc') }}
            </p>

            <div
              v-if="sent"
              class="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 sm:mt-7 sm:py-4"
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
              class="mt-4 flex w-full flex-col gap-2.5 sm:mt-5 sm:gap-3"
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

            <p class="mt-4 text-center text-sm text-neutral-500 sm:mt-5">
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
    </div>

    <p
      class="bg-neutral-50 px-4 pt-4 text-center text-[0.8125rem] leading-relaxed text-neutral-500 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pt-5 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <span class="mx-auto block max-w-lg">
        {{ t('auth.agreeToTerms') }}
        <NuxtLink
          to="/terms-of-service"
          class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
        >
          {{ t('auth.termsOfService') }}
        </NuxtLink>
        {{ t('auth.and') }}
        <NuxtLink
          to="/privacy-policy"
          class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
        >
          {{ t('auth.privacyPolicy') }}
        </NuxtLink>
        {{ t('auth.andReceiveEmails') }}
      </span>
    </p>
  </div>
</template>