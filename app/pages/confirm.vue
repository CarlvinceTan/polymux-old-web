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

  // PKCE flow: exchanging the code is what marks the email confirmed in Supabase. Skipping this leaves email_confirmed_at unset and the next sign-in fails with "email not confirmed".
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

  if (type === 'signup') {
    await supabase.auth.signOut()
    sessionStorage.removeItem('auth_redirect')
    router.replace('/verification-successful')
    return
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
