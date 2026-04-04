<script setup lang="ts">
const headerTabs = {
  Home: '/dashboard/home',
  Marketplace: '/dashboard/marketplace',
} as const satisfies Record<string, string>
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="space-y-6 p-4 sm:p-5">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-lg ghost-panel bg-white p-4">
              <h3 class="text-body-md font-medium text-neutral-500">Total chats</h3>
              <p class="mt-2 text-3xl font-bold text-neutral-950">12</p>
            </div>

            <div class="rounded-lg ghost-panel bg-white p-4">
              <h3 class="text-body-md font-medium text-neutral-500">Active Workspaces</h3>
              <p class="mt-2 text-3xl font-bold text-neutral-950">4</p>
            </div>

            <div class="rounded-lg ghost-panel bg-white p-4">
              <h3 class="text-body-md font-medium text-neutral-500">Vault Items</h3>
              <p class="mt-2 text-3xl font-bold text-neutral-950">28</p>
            </div>
          </div>

          <div class="rounded-lg ghost-panel bg-white p-4">
            <h2 class="mb-4 text-lg font-semibold text-neutral-950">Recent Activity</h2>
            <div class="space-y-3">
              <div v-for="i in 5" :key="i" class="flex items-center gap-3 py-2">
                <div class="size-8 rounded-full bg-neutral-100" />
                <div class="flex-1">
                  <div class="h-4 w-48 rounded bg-neutral-100" />
                  <div class="mt-1 h-3 w-24 rounded bg-neutral-50" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
