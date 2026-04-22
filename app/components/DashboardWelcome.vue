<script setup lang="ts">
const { t } = useI18n()
const user = useSupabaseUser()
const { currentWorkspace } = useWorkspaces()
const { draft, createDraft } = useChatSessions()

const hour = new Date().getHours()
const greetingKey = hour < 12 ? 'dashboard.goodMorning' : hour < 17 ? 'dashboard.goodAfternoon' : 'dashboard.goodEvening'

const displayName = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.full_name || meta?.name || user.value?.email?.split('@')[0] || '') as string
})

const planLabel = computed(() => {
  const plan = currentWorkspace.value?.plan ?? 'free'
  return t(`settings.${plan}Plan`)
})

async function handleNewWorkflow() {
  if (!draft.value) createDraft()
  await navigateTo('/workflow/new')
}
</script>

<template>
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-neutral-950">
        {{ t(greetingKey) }}, {{ displayName }}
      </h1>
      <p class="mt-1 text-sm text-neutral-500">
        {{ currentWorkspace?.name }} · {{ planLabel }}
      </p>
    </div>
    <button
      class="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      @click="handleNewWorkflow"
    >
      {{ t('dashboard.newWorkflow') }}
    </button>
  </div>
</template>