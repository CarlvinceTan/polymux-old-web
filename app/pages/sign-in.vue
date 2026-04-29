<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('common.signIn')} — Polymux`,
})

const supabase = useSupabaseClient()
const router = useRouter()
const route = useRoute()

/**
 * Post-signin redirect:
 * - `?redirect=<path>` wins (middleware sets this when it bounces a protected hit).
 * - Bare `/sign-in` lands on the home page.
 */
const redirectTo = computed(() => (route.query.redirect as string) || '/')

/**
 * Back target = the last non-auth, non-protected route the user visited (tracked by the
 * `auth-back-tracker` plugin). This skips intermediate auth hops (e.g. /sign-in ⇄ /sign-up)
 * and avoids bouncing into a protected route that would just redirect the user back here.
 */
function onBack() {
  const target = import.meta.client ? sessionStorage.getItem('polymux_auth_back') : null
  router.replace(target || '/')
}

const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

function storeRedirectAndOAuth(provider: 'google' | 'apple') {
  if (!import.meta.client) return
  sessionStorage.setItem('auth_redirect', redirectTo.value)
  supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/confirm` },
  })
}

async function onContinueGoogle() {
  error.value = null
  storeRedirectAndOAuth('google')
}

async function onContinueApple() {
  error.value = null
  storeRedirectAndOAuth('apple')
}

async function onSubmit() {
  if (!import.meta.client) return
  error.value = null
  pending.value = true
  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })
    if (authError) {
      error.value = authError.message
    }
    else {
      router.push(redirectTo.value)
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
          class="relative rounded-2xl border border-neutral-200/90 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
        >
          <button
            type="button"
            class="absolute left-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 outline-none ring-neutral-950 transition-colors hover:text-neutral-950 focus-visible:ring-2"
            :aria-label="t('common.back')"
            @click="onBack"
          >
            <svg class="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z" clip-rule="evenodd" />
            </svg>
          </button>
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
            {{ t('auth.welcomeBack') }}
          </h1>
          <p class="mt-1 text-center text-[0.8125rem] text-neutral-500 sm:text-sm">
            {{ t('auth.signInToAccount') }}
          </p>

          <div class="mt-3.5 flex flex-col gap-2 sm:mt-4 sm:gap-2.5">
            <button
              type="button"
              class="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
              @click="onContinueGoogle"
            >
              <span
                class="inline-flex size-4 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                <svg class="h-full w-full" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </span>
              {{ t('auth.continueWithGoogle') }}
            </button>
            <button
              type="button"
              class="flex h-10 w-full items-center justify-center gap-2.5 rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90"
              @click="onContinueApple"
            >
              <span
                class="inline-flex size-4 shrink-0 items-center justify-center text-white"
                aria-hidden="true"
              >
                <svg class="h-full w-full fill-current" viewBox="0 0 24 24">
                  <path
                    d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                  />
                </svg>
              </span>
              {{ t('auth.continueWithApple') }}
            </button>

            <div class="relative mt-1 sm:mt-1.5">
              <div class="absolute inset-0 flex items-center" aria-hidden="true">
                <div class="w-full border-t border-neutral-200" />
              </div>
              <div class="relative flex justify-center text-xs">
                <span class="bg-white px-3 font-medium uppercase tracking-wider text-neutral-400">
                  {{ t('common.or') }}
                </span>
              </div>
            </div>

            <form
              class="flex w-full flex-col gap-3 sm:gap-4"
              novalidate
              @submit.prevent="onSubmit"
            >
              <div class="flex w-full flex-col gap-2.5 sm:gap-3">
                <div>
                  <label
                    for="signin-email"
                    class="block text-sm font-medium text-neutral-800"
                  >{{ t('common.email') }}</label>
                  <input
                    id="signin-email"
                    v-model="email"
                    type="email"
                    name="email"
                    autocomplete="email"
                    :placeholder="t('auth.emailPlaceholder')"
                    class="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                  >
                </div>
                <div>
                  <div class="flex items-baseline justify-between gap-2">
                    <label
                      for="signin-password"
                      class="text-sm font-medium text-neutral-800"
                    >{{ t('common.password') }}</label>
                    <NuxtLink
                      to="/forgot-password"
                      class="text-sm font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-950"
                    >
                      {{ t('auth.forgotPassword') }}
                    </NuxtLink>
                  </div>
                  <input
                    id="signin-password"
                    v-model="password"
                    type="password"
                    name="password"
                    autocomplete="current-password"
                    placeholder="••••••••"
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
                {{ pending ? t('auth.signingIn') : t('common.signIn') }}
              </button>
            </form>

            <p class="mt-4 text-center text-[0.8125rem] text-neutral-500 sm:mt-5 sm:text-sm">
              {{ t('auth.dontHaveAccount') }}
              <NuxtLink
                to="/sign-up"
                class="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2 transition-colors hover:opacity-80"
              >
                {{ t('common.signUp') }}
              </NuxtLink>
            </p>
          </div>
        </div>
      </div>
    </div>
    <AuthTermsFooter />
  </div>
</template>