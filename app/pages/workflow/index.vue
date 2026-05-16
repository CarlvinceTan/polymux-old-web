<script setup lang="ts">
/** `/workflow` list landing — keep as `workflow/index.vue` only; do not add a sibling `pages/workflow.vue` or Nuxt can mis-match `/workflow/:id` (see nuxt/nuxt#23088). */

import { DRAFT_WORKFLOW_ID } from '~/composables/workflows/useWorkflowList'

const { t } = useI18n()
const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'

const { sessions, draft, createDraft, fetchSessions } = useWorkflowList()

onMounted(async () => {
  // Per-tab memory: within the same tab, `/workflow` restores the last-viewed workflow.
  const stored = sessionStorage.getItem(TAB_LAST_WORKFLOW_KEY)
  if (stored && sessions.value.some(s => s.id === stored)) {
    await navigateTo(stored === DRAFT_WORKFLOW_ID ? `/workflow/${DRAFT_WORKFLOW_ID}` : `/workflow/${stored}/agent`)
    return
  }

  if (!draft.value) await createDraft()
  await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="p-4 sm:p-5">
          <Placeholder
            :message="t('workflow.listEmptyPlaceholder')"
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
