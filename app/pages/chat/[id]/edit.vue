<script setup lang="ts">
const route = useRoute()
const chatId = computed(() => route.params.id as string)
const chatTitle = computed(() => {
  return (route.query.name as string) || `Chat ${chatId.value}`
})

const placeholderMessage = computed(
  () =>
    `Placeholder — build and edit steps, nodes, and connections for "${chatTitle.value}".`,
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
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </template>
    </Placeholder>
    </div>
  </TabPanel>
</template>
