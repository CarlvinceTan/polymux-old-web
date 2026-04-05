<script setup lang="ts">
const headerTabs = {
  Passwords: '/vault/passwords',
  Wallet: '/vault/wallet',
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
        <Placeholder message="Placeholder — pending invitations and account requests will appear here.">
          <template #icon>
            <svg
              class="size-8 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </template>
        </Placeholder>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
