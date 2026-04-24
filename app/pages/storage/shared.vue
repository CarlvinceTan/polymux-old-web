<script setup lang="ts">
const headerTabs = {
  MAIN: '/storage/main',
  SHARED: '/storage/shared',
  SETTINGS: '/storage/settings',
} as const satisfies Record<string, string>
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <FileBrowser storage-name="Shared" class="min-h-0 min-w-0 flex-1" />
      <StorageProviderUsageOverlay :hide-providers="['local']" />
    </div>
  </div>
</template>
