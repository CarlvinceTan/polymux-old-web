<script setup lang="ts">
import type { CalendarRun } from '~/composables/workflows/useScheduleCalendar'
import type { ListGroup } from '~/components/schedule/ScheduleListView.vue'

export interface LegendItem {
  automationId: string
  workflowId: string
  name: string
  summary: string
  active: boolean
  hidden: boolean
}

const props = defineProps<{
  legend: LegendItem[]
  groups: ListGroup[]
  displayTz: string
  nextMs: number | null
}>()
const emit = defineEmits<{
  toggle: [automationId: string]
  edit: [automationId: string]
}>()

const { t, locale } = useI18n()

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: props.displayTz, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(ms))
}
</script>

<template>
  <aside class="flex w-[280px] shrink-0 flex-col bg-neutral-50">
    <!-- Workflows legend -->
    <div class="shrink-0 px-4 pb-3 pt-5">
      <h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
        {{ t('schedule.workflows') }}
      </h3>
      <div v-if="!legend.length" class="py-1 text-caption text-neutral-500">
        {{ t('schedule.overviewEmpty') }}
      </div>
      <button
        v-for="item in legend"
        :key="item.automationId"
        type="button"
        class="flex w-full items-center gap-2.5 py-0.5 text-left transition-opacity"
        :class="item.hidden ? 'opacity-40' : ''"
        :title="item.hidden ? t('schedule.showRuns') : t('schedule.hideRuns')"
        @click="emit('toggle', item.automationId)"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="item.active ? 'bg-emerald-500' : 'bg-neutral-300'"
        />
        <span class="min-w-0 flex-1 truncate text-body-md font-medium" :class="item.active ? 'text-neutral-800' : 'text-neutral-500'">
          {{ item.name }}
        </span>
        <span class="shrink-0 font-mono text-2xs text-neutral-500">{{ item.summary }}</span>
      </button>
    </div>

    <!-- Upcoming agenda -->
    <div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <h3 class="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
        {{ t('schedule.nextRuns') }}
      </h3>
      <div v-if="!groups.length" class="text-caption text-neutral-500">
        {{ t('schedule.noRunsShort') }}
      </div>
      <div v-for="g in groups" :key="g.key" class="mb-4">
        <div class="mb-1.5 flex items-baseline justify-between">
          <span class="text-caption font-semibold text-neutral-700">{{ g.dayLabel }}</span>
          <span class="font-mono text-2xs text-neutral-400">{{ g.relLabel }}</span>
        </div>
        <button
          v-for="run in g.runs"
          :key="run.key"
          type="button"
          class="flex w-full items-center gap-2.5 py-1 text-left"
          @click="emit('edit', run.automationId)"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="run.ms === nextMs ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-neutral-300'"
          />
          <span class="min-w-0 flex-1 truncate text-body-md" :class="run.ms === nextMs ? 'font-semibold text-neutral-950' : 'text-neutral-800'">
            {{ run.workflowName }}
            <span v-if="run.ms === nextMs" class="ml-1 rounded-full bg-emerald-50 px-1.5 py-px text-2xs font-semibold uppercase tracking-wider text-emerald-700 align-middle">{{ t('schedule.nextBadge') }}</span>
          </span>
          <span class="shrink-0 font-mono text-2xs text-neutral-500 tabular-nums">{{ fmtTime(run.ms) }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>
