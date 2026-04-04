<script setup lang="ts">
const route = useRoute()
const chatTitle = computed(() => {
  const id = route.params.id as string
  return (route.query.name as string) || `Chat ${id}`
})

const placeholderMessage = computed(
  () =>
    `Placeholder — graphs, runs, and outputs for "${chatTitle.value}" will appear here.`,
)
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <div class="p-4 sm:p-5">
    <Placeholder :message="placeholderMessage">
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
          <path d="M3 3v18h18" />
          <path d="M7 12v5" />
          <path d="M12 7v10" />
          <path d="M17 15v2" />
        </svg>
      </template>
    </Placeholder>
    </div>
  </TabPanel>
</template>
