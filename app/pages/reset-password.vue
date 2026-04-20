<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('auth.resetPassword')} — Polymux`,
})

const supabase = useSupabaseClient()
const router = useRouter()

const password = ref('')
const passwordConfirm = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

async function onSubmit() {
  if (!import.meta.client) return
  error.value = null
  if (password.value !== passwordConfirm.value) {
    error.value = t('auth.passwordsDoNotMatch')
    return
  }
  if (password.value.length < 6) {
    error.value = t('auth.passwordMinLength')
    return
  }
  pending.value = true
  try {
    const { error: authError } = await supabase.auth.updateUser({
      password: password.value,
    })
    if (authError) {
      error.value = authError.message
    }
    else {
      success.value = true
      setTimeout(() => router.push('/sign-in'), 2000)
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
              {{ t('auth.resetPassword') }}
            </h1>
            <p class="mt-1.5 text-center text-sm text-neutral-500 sm:mt-2">
              {{ t('auth.resetPasswordDesc') }}
            </p>

            <div
              v-if="success"
              class="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 sm:mt-7 sm:py-4"
              role="status"
            >
              <p class="font-medium text-neutral-950">
                {{ t('auth.passwordUpdated') }}
              </p>
            </div>

            <form
              v-else
              class="mt-4 flex w-full flex-col gap-2.5 sm:mt-5 sm:gap-3"
              novalidate
              @submit.prevent="onSubmit"
            >
              <div class="flex w-full flex-col gap-2.5 sm:gap-3">
                <div>
                  <label
                    for="reset-password"
                    class="block text-sm font-medium text-neutral-800"
                  >{{ t('auth.newPassword') }}</label>
                  <input
                    id="reset-password"
                    v-model="password"
                    type="password"
                    name="password"
                    autocomplete="new-password"
                    :placeholder="t('auth.newPassword')"
                    class="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                  >
                </div>
                <div>
                  <label
                    for="reset-password-confirm"
                    class="block text-sm font-medium text-neutral-800"
                  >{{ t('auth.confirmNewPassword') }}</label>
                  <input
                    id="reset-password-confirm"
                    v-model="passwordConfirm"
                    type="password"
                    name="password-confirm"
                    autocomplete="new-password"
                    :placeholder="t('auth.confirmNewPassword')"
                    class="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                  >
                </div>
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
                {{ pending ? t('auth.updatingPassword') : t('auth.updatePassword') }}
              </button>
            </form>

            <p class="mt-5 text-center text-sm text-neutral-500 sm:mt-7">
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
        </NuxtLink>{{ t('auth.andReceiveEmails') }}
      </span>
    </p>
  </div>
</template>