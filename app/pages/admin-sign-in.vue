<script setup lang="ts">
// Dedicated sign-in for the maintainer console (admin.polymux.com). Same visual
// language as the product sign-in, but stripped to sign-in-only: no marketing
// chrome, no sign-up, no "back to site", and it always lands on /admin. Admin
// surfaces are English-only (see web/CLAUDE.md), so no i18n here.
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const router = useRouter()

useHead({ title: 'Admin sign in · Polymux' })

const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

function onContinueGoogle() {
  if (!import.meta.client) return
  error.value = null
  // confirm.vue routes here after the OAuth round-trip.
  sessionStorage.setItem('auth_redirect', '/admin')
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/confirm` },
  })
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
    if (authError) error.value = authError.message
    else router.push('/admin')
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
        <div class="relative rounded-2xl border border-neutral-200/90 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:px-6 sm:py-6">
          <div class="mb-3 flex w-full justify-center">
            <PolymuxLogo class="size-12 shrink-0 sm:size-14" />
          </div>

          <h1 class="text-center text-[1.25rem] font-semibold tracking-tight text-neutral-950 sm:text-[1.375rem]">
            Admin Sign In
          </h1>
          <p class="mt-1 text-center text-[0.8125rem] text-neutral-500 sm:text-sm">
            Sign in to the Polymux admin console.
          </p>

          <div class="mt-4 flex flex-col gap-2.5">
            <button
              type="button"
              class="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
              @click="onContinueGoogle"
            >
              <span class="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                <svg class="h-full w-full" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              Continue with Google
            </button>

            <div class="relative mt-1">
              <div class="absolute inset-0 flex items-center" aria-hidden="true">
                <div class="w-full border-t border-neutral-200" />
              </div>
              <div class="relative flex justify-center text-xs">
                <span class="bg-white px-3 font-medium uppercase tracking-wider text-neutral-400">or</span>
              </div>
            </div>

            <form class="flex w-full flex-col gap-3 sm:gap-4" novalidate @submit.prevent="onSubmit">
              <div class="flex w-full flex-col gap-2.5 sm:gap-3">
                <div>
                  <label for="admin-email" class="block text-sm font-medium text-neutral-800">Email</label>
                  <input
                    id="admin-email"
                    v-model="email"
                    type="email"
                    name="email"
                    autocomplete="email"
                    placeholder="you@polymux.com"
                    class="auth-input mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                  >
                </div>
                <div>
                  <label for="admin-password" class="block text-sm font-medium text-neutral-800">Password</label>
                  <input
                    id="admin-password"
                    v-model="password"
                    type="password"
                    name="password"
                    autocomplete="current-password"
                    placeholder="••••••••"
                    class="auth-input mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                  >
                </div>
              </div>
              <p v-if="error" class="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                {{ error }}
              </p>
              <button
                type="submit"
                :disabled="pending"
                class="h-10 w-full rounded-md bg-neutral-950 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {{ pending ? 'Signing in…' : 'Sign in' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
