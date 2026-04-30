<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

// `@nuxtjs/supabase` writes the auth cookie via an onAuthStateChange listener fired after exchangeCodeForSession resolves; without this wait the next $fetch races the cookie write and the server route returns 401.
function waitForUser(timeoutMs = 3000) {
  if (user.value) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const stop = watch(user, (u) => {
      if (u) {
        stop()
        resolve()
      }
    })
    setTimeout(() => {
      stop()
      resolve()
    }, timeoutMs)
  })
}

onMounted(async () => {
  const code = route.query.code as string | undefined
  const type = route.query.type as string | undefined

  // Signup email confirmation: Supabase has already marked the email confirmed before redirecting here. Skip the session exchange so the user stays signed out and lands on the "please sign in" page.
  if (type === 'signup') {
    sessionStorage.removeItem('auth_redirect')
    router.replace('/verification-successful')
    return
  }

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    await waitForUser()
  }

  try {
    await $fetch('/api/mailing-list/auto-link')
  }
  catch (err) {
    console.error('Failed to auto-link mailing list subscriber:', err)
  }

  const redirect = sessionStorage.getItem('auth_redirect')
  if (redirect) {
    sessionStorage.removeItem('auth_redirect')
    router.replace(redirect)
  }
  else {
    router.replace('/')
  }
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-neutral-50">
    <div class="flex flex-col items-center gap-3">
      <div class="size-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-950" />
      <p class="text-sm text-neutral-500">
        {{ $t('auth.signingYouIn') }}
      </p>
    </div>
  </div>
</template>
