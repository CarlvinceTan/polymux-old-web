<script setup lang="ts">
const { headerTabs } = useStorageNavTabs()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>
    <div class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <FileBrowser storage-name="Files" class="min-h-0 min-w-0 flex-1" />
      <StorageProviderUsageOverlay />
    </div>
  </div>
</template>
