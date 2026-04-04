<script setup lang="ts">
const headerTabs = {
  Profile: '/config/profile',
  Settings: '/config/settings',
} as const satisfies Record<string, string>
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="p-4 sm:p-5">
        <Placeholder message="Placeholder — your profile, avatar, and display name will appear here.">
          <template #icon>
            <svg
              class="size-8 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
            </svg>
          </template>
        </Placeholder>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
