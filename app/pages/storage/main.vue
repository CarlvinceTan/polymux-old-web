<script setup lang="ts">
const headerTabs = {
  MAIN: '/storage/main',
  SHARED: '/storage/shared',
} as const satisfies Record<string, string>

const user = useSupabaseUser()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <GuestPlaceholder v-if="!user" />
      <FileBrowser v-else storage-name="Main" class="min-h-0 min-w-0 flex-1" />
    </div>
  </div>
</template>
