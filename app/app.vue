<script setup lang="ts">
const route = useRoute()
const { locale } = useI18n({ useScope: 'global' })

const siteUrl = 'https://polymux.com'
const canonical = computed(() => {
  const path = route.path === '/' ? '' : route.path
  return `${siteUrl}${path}`
})

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: (title?: string) =>
    title ? `${title} | Polymux` : 'Polymux — AI Agents for Browser Automation',
  link: [{ rel: 'canonical', href: canonical }],
  meta: [{ property: 'og:url', content: canonical }],
})

const APP_ROUTE_PREFIXES = ['/workflow', '/dashboard', '/storage', '/vault', '/integrations', '/session']

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
    <OnboardingModal v-model:open="betaModalOpen" @accept="acceptBeta" />
  </UApp>
</template>
