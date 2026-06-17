<script setup lang="ts">
// Admin/maintainer shell — used by everything under /admin (i.e. the admin
// subdomain). Deliberately has NO product SidePanel; a slim top bar instead.
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const route = useRoute()

const nav = [
  { label: 'Plugins', to: '/admin/plugins' },
  { label: 'Judgments', to: '/admin/judgments' },
  { label: 'Criteria', to: '/admin/criteria' },
  { label: 'Metrics', to: '/admin/metrics' },
  { label: 'Benchmarks', to: '/admin/benchmarks' },
  { label: 'Governance', to: '/admin/governance' },
  { label: 'Maintenance', to: '/admin/maintenance' },
  { label: 'Blogs', to: '/admin/blogs' },
  { label: 'Maintainers', to: '/admin/maintainers' },
]

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/sign-in')
}
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col bg-neutral-50">
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
      <div class="flex items-center gap-4">
        <NuxtLink to="/admin" class="flex items-center gap-2">
          <span class="text-sm font-semibold text-neutral-950">Polymux</span>
          <span class="rounded-md bg-neutral-900 px-1.5 py-0.5 text-label-md font-medium text-white">Admin</span>
        </NuxtLink>
        <nav class="flex items-center gap-0.5 overflow-x-auto">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-body-md font-medium transition-colors"
            :class="route.path.startsWith(item.to) ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-500 hover:text-neutral-950'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="user" class="hidden text-label-md text-neutral-500 sm:inline">{{ user.email }}</span>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </main>

    <AppToastContainer />
  </div>
</template>
