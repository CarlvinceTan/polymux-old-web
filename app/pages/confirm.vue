<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
  const code = route.query.code as string | undefined

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
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
    router.replace('/workflow')
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
