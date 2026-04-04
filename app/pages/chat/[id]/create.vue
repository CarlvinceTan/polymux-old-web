<script setup lang="ts">
const route = useRoute()
const chatTitle = computed(() => {
  const id = route.params.id as string
  return (route.query.name as string) || `Chat ${id}`
})

const placeholderMessage = computed(
  () =>
    `Placeholder — messages and prompts for "${chatTitle.value}" will live here.`,
)

const command = ref('')
function onSend(value: string) {
  const t = value.trim()
  if (!t) return
  command.value = ''
}
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <template #title>
      <h2 class="min-w-0 text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title">
        {{ chatTitle }}
      </h2>
    </template>

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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </template>
    </Placeholder>
    </div>

    <template #footer>
      <PromptInput v-model="command" full-width hint="Message this chat…" @send="onSend" />
    </template>
  </TabPanel>
</template>
