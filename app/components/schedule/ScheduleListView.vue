<script setup lang="ts">
import type { CalendarRun } from '~/composables/workflows/useScheduleCalendar'

export interface ListGroup {
  key: string
  dayLabel: string
  relLabel: string
  runs: CalendarRun[]
}

const props = defineProps<{
  groups: ListGroup[]
  displayTz: string
  nextMs: number | null
}>()
const emit = defineEmits<{ edit: [automationId: string] }>()

const { t, locale } = useI18n()

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: props.displayTz, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(ms))
}
</script>

<template>
  <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4">
    <div v-if="!groups.length" class="flex h-full flex-col items-center justify-center gap-1.5 text-center">
      <UIcon name="i-heroicons-calendar" class="size-5 text-neutral-300" />
      <div class="text-body-md text-neutral-500">{{ t('schedule.noRuns') }}</div>
    </div>
    <div v-else class="mx-auto max-w-2xl">
      <div v-for="g in groups" :key="g.key" class="mb-5">
        <div class="mb-1.5 flex items-baseline justify-between border-b border-neutral-200 pb-1.5">
          <h3 class="text-body-md font-semibold text-neutral-900">{{ g.dayLabel }}</h3>
          <span class="font-mono text-caption text-neutral-400">{{ g.relLabel }}</span>
        </div>
        <button
          v-for="run in g.runs"
          :key="run.key"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-50"
          @click="emit('edit', run.automationId)"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="!run.active ? 'bg-neutral-300' : run.ms === nextMs ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-emerald-400'"
          />
          <span class="min-w-0 flex-1 truncate text-body-md" :class="!run.active ? 'text-neutral-400' : run.ms === nextMs ? 'font-semibold text-neutral-950' : 'text-neutral-800'">
            {{ run.workflowName }}
            <span v-if="run.ms === nextMs" class="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-emerald-700 align-middle">{{ t('schedule.nextBadge') }}</span>
            <UIcon v-if="!run.recurring" name="i-heroicons-bookmark" class="ml-1 inline size-3 text-neutral-400 align-middle" :title="t('schedule.oneOff')" />
          </span>
          <span class="shrink-0 font-mono text-caption tabular-nums" :class="run.active ? 'text-neutral-500' : 'text-neutral-400'">{{ fmtTime(run.ms) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
