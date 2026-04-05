<script setup lang="ts">
const headerTabs = {
  Console: '/workspace/console',
  Schedule: '/workspace/schedule',
  Visualiser: '/workspace/visualiser',
  Settings: '/workspace/settings',
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
          message="Placeholder — design and edit your workflows with the visual editor. Drag and drop components to build automation flows."
        >
          <template #icon>
            <svg
              class="size-8 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </template>
        </Placeholder>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
