<script setup lang="ts">
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

// After OAuth, the user becomes non-null when the app regains focus.
// Consume any stored redirect target set before the OAuth flow started.
watch(user, (newUser, oldUser) => {
  if (newUser && !oldUser && import.meta.client) {
    const redirect = sessionStorage.getItem('auth_redirect')
    if (redirect) {
      sessionStorage.removeItem('auth_redirect')
      router.push(redirect)
    }
  }
})

const APP_ROUTE_PREFIXES = ['/workflow', '/dashboard', '/settings', '/storage', '/vault', '/integrations', '/session']

const isAppRoute = computed(() =>
  APP_ROUTE_PREFIXES.some(p => route.path === p || route.path.startsWith(p + '/')),
)

const { available: serverAvailable } = useServerHealth()

const showServerError = computed(() => !serverAvailable.value && isAppRoute.value)

const { accepted: betaAccepted, ready: betaReady, accept: acceptBeta } = useBetaAgreement()

const betaModalOpen = computed({
  get: () => isAppRoute.value && betaReady.value && !betaAccepted.value,
  set: () => {
    // Modal can only be dismissed by accepting; ignore other close attempts.
  },
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ServerUnavailable v-if="showServerError" />
    <AgreementModal v-model:open="betaModalOpen" @accept="acceptBeta" />
  </UApp>
</template>
