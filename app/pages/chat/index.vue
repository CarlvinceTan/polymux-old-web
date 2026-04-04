<script setup lang="ts">
/** `/chat` list landing — keep as `chat/index.vue` only; do not add a sibling `pages/chat.vue` or Nuxt can mis-match `/chat/:id` (see nuxt/nuxt#23088). */
const headerTabs = {
  Create: '/chat/0/create',
  Edit: '/chat/0/edit',
  Visualise: '/chat/0/visualise',
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
        <Placeholder
          message="Placeholder — open a chat from the sidebar or use the tabs above to switch between Create, Edit, and Visualise."
        >
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
      </TabPanel>
    </div>
  </div>
</template>
