<script setup lang="ts">
import type { WorkflowVersion } from '~/composables/useWorkflows'

const props = defineProps<{
  open: boolean
  versions: WorkflowVersion[]
  currentVersionId?: string | null
  selectedVersionId?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [versionId: string | null]
  revert: [version: WorkflowVersion]
}>()

const { t } = useI18n()

function impactClasses(level: string): string {
  switch (level) {
    case 'fundamental': return 'bg-rose-100 text-rose-700'
    case 'significant': return 'bg-amber-100 text-amber-700'
    case 'preference':  return 'bg-sky-100 text-sky-700'
    default:            return 'bg-neutral-100 text-neutral-600'
  }
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  }
  catch {
    return iso
  }
}

function onRowClick(v: WorkflowVersion) {
  if (props.selectedVersionId === v.id) emit('select', null)
  else emit('select', v.id)
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
    enter-active-class="transition-transform duration-200 ease-out"
    leave-active-class="transition-transform duration-200 ease-in"
  >
    <aside
      v-if="open"
      class="absolute inset-y-0 right-0 z-10 flex w-80 min-w-0 flex-col bg-white"
    >
      <header class="flex shrink-0 items-start justify-between gap-2 px-4 py-2">
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold text-neutral-900">
            {{ t('workflow.historyTitle') }}
          </h2>
          <p class="truncate text-[11px] text-neutral-500">
            {{ t('workflow.historySubtitle') }}
          </p>
        </div>
        <button
          type="button"
          class="flex size-7 shrink-0 items-center justify-center rounded hover:bg-neutral-100"
          :aria-label="t('workflow.close')"
          @click="emit('close')"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-4 text-neutral-600" />
        </button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div v-if="loading" class="flex flex-1 items-center justify-center text-xs text-neutral-400">
          {{ t('workflow.loadingHistory') }}
        </div>
        <div v-else-if="versions.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <UIcon name="i-heroicons-clock-20-solid" class="size-8 text-neutral-300" />
          <p class="text-sm text-neutral-500">{{ t('workflow.noHistory') }}</p>
        </div>
        <ul v-else class="flex flex-col">
          <li
            v-for="v in versions"
            :key="v.id"
            class="border-b border-neutral-100 last:border-b-0"
          >
            <button
              type="button"
              class="flex w-full flex-col items-stretch gap-1 border-l-2 px-4 py-3 text-left transition-colors"
              :class="[
                v.id === selectedVersionId
                  ? 'border-neutral-900 bg-neutral-100'
                  : v.id === currentVersionId
                    ? 'border-emerald-500 bg-emerald-50/60 hover:bg-emerald-50'
                    : 'border-transparent hover:bg-neutral-50',
              ]"
              @click="onRowClick(v)"
            >
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold text-neutral-900">v{{ v.version }}</span>
                <span
                  class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                  :class="impactClasses(v.impact_level)"
                >
                  {{ v.impact_level }}
                </span>
                <span
                  class="inline-flex items-center rounded-sm bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600"
                >
                  {{ v.source }}
                </span>
                <span
                  v-if="v.id === currentVersionId"
                  class="ml-auto inline-flex items-center rounded-sm bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                >
                  {{ t('workflow.current') }}
                </span>
              </div>
              <p v-if="v.change_summary" class="text-xs text-neutral-700 line-clamp-2">
                {{ v.change_summary }}
              </p>
              <p class="text-[11px] text-neutral-400">
                {{ formatDate(v.created_at) }}
              </p>
              <div
                v-if="v.id === selectedVersionId && v.id !== currentVersionId"
                class="mt-1 flex justify-end"
              >
                <button
                  type="button"
                  class="rounded border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-neutral-800"
                  @click.stop="emit('revert', v)"
                >
                  {{ t('workflow.revert') }}
                </button>
              </div>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  </Transition>
</template>
