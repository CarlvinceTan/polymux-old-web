<script setup lang="ts">
const route = useRoute()

const siteName = 'Polymux'
const siteUrl = 'https://polymux.com'
const canonical = computed(() => {
  const path = route.fullPath === '/' ? '' : route.fullPath
  return `${siteUrl}${path}`
})

useHead({
  titleTemplate: (title?: string) => (title ? `${siteName} ${title}` : siteName),
  meta: [
    { property: 'og:site_name', content: siteName },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
  ],
  link: [
    { rel: 'canonical', href: canonical },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteName,
        url: siteUrl,
      }),
    },
  ],
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
