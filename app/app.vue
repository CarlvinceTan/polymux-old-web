<script setup lang="ts">
const { t } = useI18n()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()
const { show: showToast } = useAppToast()

// After OAuth, the user becomes non-null when the app regains focus.
// Consume any stored redirect target set before the OAuth flow started.
watch(user, (newUser, oldUser) => {
  if (newUser && !oldUser && import.meta.client) {
    const redirect = sessionStorage.getItem('auth_redirect')
    if (redirect) {
      sessionStorage.removeItem('auth_redirect')
      router.push(redirect)
    }

    if (sessionStorage.getItem('guest_sessions_saved') === 'true') {
      sessionStorage.removeItem('guest_sessions_saved')
      showToast(t('auth.guestSessionsSaved'), 'info')
    }
  }
})

const APP_ROUTE_PREFIXES = ['/chat', '/dashboard', '/settings', '/storage', '/vault', '/integrations', '/session']

const isAppRoute = computed(() =>
  APP_ROUTE_PREFIXES.some(p => route.path === p || route.path.startsWith(p + '/')),
)

const { available: serverAvailable } = useServerHealth()

const showServerError = computed(() => !serverAvailable.value && isAppRoute.value)
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <BugReportButton v-if="isAppRoute" />
    <ServerUnavailable v-if="showServerError" />
  </UApp>
</template>
