<script setup lang="ts">
const route = useRoute()

const navLinks = [
  { to: '/dev/docs', label: 'Docs' },
  { to: '/dev/docs#api-reference', label: 'API Reference' },
  { to: '/dev/integrations', label: 'Integrations' },
  { to: '/dev/dashboard', label: 'Dashboard' },
] as const

function isActive(to: string): boolean {
  const path = to.split('#')[0] ?? to
  if (path === '/dev') return route.path === '/dev'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-white">
    <header class="sticky top-0 z-40 border-b border-neutral-200/60 bg-white/85 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <NuxtLink to="/dev" class="shrink-0">
          <DevLogo />
        </NuxtLink>

        <nav class="hidden items-center gap-1 md:flex">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="relative px-3 py-1.5 text-sm font-medium tracking-tight transition-colors"
            :class="isActive(link.to) ? 'text-neutral-950' : 'text-neutral-500 hover:text-neutral-800'"
          >
            {{ link.label }}
            <span
              v-if="isActive(link.to)"
              class="absolute inset-x-3 -bottom-px h-0.5 bg-neutral-950"
              aria-hidden="true"
            />
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-3">
          <NuxtLink
            to="/"
            class="hidden text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 sm:inline-flex"
          >
            polymux.com
          </NuxtLink>
          <NuxtLink
            to="/dev/dashboard"
            class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Sign in
            <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-neutral-200 bg-neutral-50">
      <div class="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <DevLogo />
        <nav class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500">
          <NuxtLink to="/dev/docs" class="hover:text-neutral-800">
            Docs
          </NuxtLink>
          <NuxtLink to="/dev/integrations" class="hover:text-neutral-800">
            Integrations
          </NuxtLink>
          <NuxtLink to="/privacy-policy" class="hover:text-neutral-800">
            Privacy
          </NuxtLink>
          <NuxtLink to="/terms-of-service" class="hover:text-neutral-800">
            Terms
          </NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
