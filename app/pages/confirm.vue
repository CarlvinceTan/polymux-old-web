<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
  const code = route.query.code as string | undefined

  // Check if converting an anonymous session before exchanging the code
  const { data: { session: prevSession } } = await supabase.auth.getSession()
  const wasAnonymous = prevSession?.user?.is_anonymous === true

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (wasAnonymous) {
    sessionStorage.setItem('guest_sessions_saved', 'true')
  }

  // Auto-link mailing list subscriber if applicable
  try {
    await $fetch('/api/mailing-list/auto-link')
  }
  catch (err) {
    console.error('Failed to auto-link mailing list subscriber:', err)
    // Don't fail the auth flow if auto-link fails
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
