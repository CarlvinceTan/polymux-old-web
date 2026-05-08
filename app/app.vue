<script setup lang="ts">
const route = useRoute()

// Brand-aware SEO metadata. The same web/ codebase serves polymux.com
// (marketing site) and dev.polymux.com (developer platform) — Google's
// site-name feature reads og:site_name + the JSON-LD WebSite schema below
// to render each domain with its own SERP entry.
const requestURL = useRequestURL()
const isDevHost = requestURL.hostname === 'dev.polymux.com'
const siteName = isDevHost ? 'Polymux Development Platform' : 'Polymux'
const siteUrl = isDevHost ? 'https://dev.polymux.com' : 'https://polymux.com'
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
